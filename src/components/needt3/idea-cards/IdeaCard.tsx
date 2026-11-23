"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  LuCheck,
  LuLightbulb,
  LuNewspaper,
  LuPlay,
  LuSparkles,
  LuUndo2,
} from "react-icons/lu";

import "./idea-cards.css";
import {
  COPY,
  type IdeaData,
  type IdeaIconKey,
  type IdeaLang,
  type IdeaLayout,
  type IdeaPhase,
  type IdeaVariant,
} from "./idea-model";

const GLYPH: Record<IdeaIconKey, typeof LuNewspaper> = {
  news: LuNewspaper,
  watch: LuPlay,
};

/** The two buttons, the same words in every variant; the skin is the CSS. */
function Actions({
  lang,
  onTake,
  onSkip,
}: {
  lang: IdeaLang;
  onTake: () => void;
  onSkip: () => void;
}) {
  const t = COPY[lang];
  return (
    <div className="ic-acts">
      <button
        type="button"
        className="ic-btn is-take"
        data-idea-take=""
        onClick={onTake}
      >
        {t.take}
      </button>
      <button
        type="button"
        className="ic-btn is-skip"
        data-idea-skip=""
        onClick={onSkip}
      >
        {t.skip}
      </button>
    </div>
  );
}

interface CardProps {
  variant: IdeaVariant;
  layout: IdeaLayout;
  idea: IdeaData;
  lang: IdeaLang;
  onTake: () => void;
  onSkip: () => void;
}

/**
 * One idea, as a card between two tasks. Three skins on one content:
 *   1 — soft raised card: the volume material, a tile in the object's colour;
 *   2 — dashed ghost: no fill, a sparkle, optional by look;
 *   3 — sponsored slot: a label strip, the colour as texture, pill buttons.
 * The accent is never a fill; the object's colour is a mark or a texture.
 */
export function IdeaCard({
  variant,
  layout,
  idea,
  lang,
  onTake,
  onSkip,
}: CardProps) {
  const t = COPY[lang];
  const Glyph = GLYPH[idea.icon];
  const meta = `${idea.minutes} ${t.min} · ${idea.project}`;
  const style = { "--hue": idea.hue } as CSSProperties;
  const acts = <Actions lang={lang} onTake={onTake} onSkip={onSkip} />;
  const text = (
    <div className="ic-body">
      {variant === 3 ? null : (
        <span className="ic-eyebrow">
          {variant === 1 ? <LuLightbulb size={12} aria-hidden="true" /> : null}
          {t.idea}
        </span>
      )}
      <p className="ic-title">{idea.title[lang]}</p>
      <p className="ic-meta">{meta}</p>
    </div>
  );

  if (variant === 3) {
    return (
      <section
        className={`ic ic-v3 ic-${layout}`}
        style={style}
        aria-label={t.slot}
        data-idea-card="3"
      >
        <header className="ic-strip">
          <span className="ic-strip-l">
            <LuLightbulb size={12} aria-hidden="true" />
            {t.slot}
          </span>
          <span className="ic-strip-r">{t.optional}</span>
        </header>
        <div className="ic-slot-body">
          <span className="ic-mark" aria-hidden="true">
            <Glyph size={layout === "phone" ? 22 : 18} />
          </span>
          {text}
          {acts}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`ic ic-v${variant} ic-${layout}`}
      style={style}
      aria-label={t.idea}
      data-idea-card={variant}
    >
      {variant === 1 ? (
        <span className="ic-tile" aria-hidden="true">
          <Glyph size={layout === "phone" ? 22 : 18} />
        </span>
      ) : (
        <span className="ic-mark" aria-hidden="true">
          <LuSparkles size={layout === "phone" ? 22 : 18} />
        </span>
      )}
      {text}
      {acts}
    </section>
  );
}

/** Opens and closes by height, so the rows around it move with it. */
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="ic-fold" data-open={open ? "1" : "0"}>
      <div className="ic-fold-in" inert={open ? undefined : true}>
        {children}
      </div>
    </div>
  );
}

const SKIP_HOLD_MS = 7000;
const ADDED_HOLD_MS = 3200;

/**
 * The notice after old overdue tasks became ideas: one line, with the way
 * back. Presentational: the screen passes the count and what Undo does.
 */
export function IdeaMovedNote({
  lang,
  count,
  onUndo,
}: {
  lang: IdeaLang;
  count: number;
  onUndo?: () => void;
}) {
  const t = COPY[lang];
  return (
    <div className="ic-note ic-moved" data-idea-moved="">
      <span className="ic-note-t">
        <LuLightbulb size={14} aria-hidden="true" />
        {t.moved(count)}
      </span>
      <button type="button" className="ic-undo" onClick={onUndo}>
        <LuUndo2 size={14} aria-hidden="true" />
        {t.undo}
      </button>
    </div>
  );
}

interface SlotProps extends Omit<CardProps, "onTake" | "onSkip"> {
  /** What the screen does on each answer; the slot also moves by itself. */
  onTake?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
  /** A fixed phase (a shot): nothing moves on its own. */
  phase?: IdeaPhase;
  /** The task row the idea becomes: the screen's own row component. */
  renderTaken: () => ReactNode;
}

/**
 * The slot in the list: the card, and what it turns into. Take it: the card
 * folds away and the task row opens in its place with a short confirmation.
 * Skip: it folds to a one-line note with Undo, and after a while to nothing.
 * A card is never overdue and never comes back as a red row.
 */
export function IdeaSlot({
  variant,
  onTake,
  onSkip,
  onUndo,
  layout,
  idea,
  lang,
  phase: fixed,
  renderTaken,
}: SlotProps) {
  const t = COPY[lang];
  const [phase, setPhase] = useState<IdeaPhase>(fixed ?? "idea");
  const [note, setNote] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const frozen = fixed !== undefined;

  useEffect(() => {
    if (fixed !== undefined) setPhase(fixed);
  }, [fixed]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (frozen) return undefined;
    if (phase === "skipped")
      timer.current = window.setTimeout(() => setPhase("gone"), SKIP_HOLD_MS);
    if (phase === "took") {
      setNote(true);
      timer.current = window.setTimeout(() => setNote(false), ADDED_HOLD_MS);
    }
    return () => window.clearTimeout(timer.current);
  }, [phase, frozen]);

  const take = useCallback(() => {
    setPhase("took");
    onTake?.();
  }, [onTake]);
  const skip = useCallback(() => {
    setPhase("skipped");
    onSkip?.();
  }, [onSkip]);
  const undo = useCallback(() => {
    setPhase("idea");
    onUndo?.();
  }, [onUndo]);

  return (
    <div
      className={`ic-slot ic-${layout}`}
      data-phase={phase}
      data-idea-slot={variant}
    >
      <Fold open={phase === "idea"}>
        <IdeaCard
          variant={variant}
          layout={layout}
          idea={idea}
          lang={lang}
          onTake={take}
          onSkip={skip}
        />
      </Fold>
      <Fold open={phase === "took"}>
        <div className="ic-landed">{renderTaken()}</div>
        <div className="ic-added" data-shown={note ? "1" : "0"}>
          <LuCheck size={12} aria-hidden="true" />
          <span>{t.added}</span>
          <button type="button" className="ic-undo" onClick={undo}>
            {t.undo}
          </button>
        </div>
      </Fold>
      <Fold open={phase === "skipped"}>
        <div className="ic-note" data-idea-note="">
          <span>{t.hidden}</span>
          <button type="button" className="ic-undo" onClick={undo}>
            <LuUndo2 size={14} aria-hidden="true" />
            {t.undo}
          </button>
        </div>
      </Fold>
    </div>
  );
}
