"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

import { LuCheck, LuLightbulb, LuUndo2 } from "react-icons/lu";

import type { IdeaCardData } from "@/lib/needt3/idea-cards";
import { isTaskIconKey, taskIconKey } from "@/lib/needt3/task-icon";

import { TaskGlyphBare } from "../phone/home/TaskGlyph";
import { IDEA_COPY } from "./copy";
import { useWhenSeen } from "./useWhenSeen";

/**
 * One idea, as a soft raised card between two tasks of Today (the phone).
 * The volume material: layered soft shadows, a light rim, an inner highlight;
 * a tile in the object's own colour (the idea's project) and a small Idea
 * label. The accent is never a fill: the colour is a mark.
 *
 * `onSeen` fires once, when the card is really on screen (see `useWhenSeen`);
 * that is what counts it against the day's two.
 */
export function IdeaCard({
  card,
  onTake,
  onSkip,
  onSeen,
  busy = false,
  watch = true,
}: {
  card: IdeaCardData;
  onTake: () => void;
  onSkip: () => void;
  onSeen?: () => void;
  busy?: boolean;
  /** Count the card as shown when it is seen; false while it is folded away. */
  watch?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useWhenSeen(ref, () => onSeen?.(), { enabled: watch && !!onSeen });
  const key = isTaskIconKey(card.icon) ? card.icon : taskIconKey(card.title);
  const meta = [`${card.minutes} ${IDEA_COPY.min}`, card.project]
    .filter(Boolean)
    .join(" · ");
  const style = card.hue ? ({ "--hue": card.hue } as CSSProperties) : undefined;
  return (
    <section
      ref={ref}
      className="ic ic-v1 ic-phone"
      style={style}
      aria-label={IDEA_COPY.idea}
      data-idea-card={card.id}
    >
      <span className="ic-tile" aria-hidden="true">
        <TaskGlyphBare iconKey={key} size={22} />
      </span>
      <div className="ic-body">
        <span className="ic-eyebrow">
          <LuLightbulb size={12} aria-hidden="true" />
          {IDEA_COPY.idea}
        </span>
        <p className="ic-title">{card.title}</p>
        <p className="ic-meta">{meta}</p>
      </div>
      <div className="ic-acts">
        <button
          type="button"
          className="ic-btn is-take"
          data-idea-take=""
          disabled={busy}
          onClick={onTake}
        >
          {IDEA_COPY.take}
        </button>
        <button
          type="button"
          className="ic-btn is-skip"
          data-idea-skip=""
          disabled={busy}
          onClick={onSkip}
        >
          {IDEA_COPY.skip}
        </button>
      </div>
    </section>
  );
}

/** Opens and closes by height, so the rows around it move with it. */
export function IdeaFold({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div className="ic-fold" data-open={open ? "1" : "0"}>
      <div className="ic-fold-in" inert={open ? undefined : true}>
        {children}
      </div>
    </div>
  );
}

/**
 * The notice after the sweep moved old overdue tasks to Ideas: one line with
 * the way back. Presentational: the screen passes the server's line and what
 * Undo does.
 */
export function IdeaMovedNote({
  message,
  onUndo,
}: {
  message: string;
  onUndo?: () => void;
}) {
  return (
    <div className="ic-note ic-moved" data-idea-moved="">
      <span className="ic-note-t">
        <LuLightbulb size={14} aria-hidden="true" />
        <span className="ic-note-m">{message}</span>
      </span>
      {onUndo ? (
        <button type="button" className="ic-undo" onClick={onUndo}>
          <LuUndo2 size={14} aria-hidden="true" />
          {IDEA_COPY.undo}
        </button>
      ) : null}
    </div>
  );
}

export type IdeaPhase = "idea" | "took" | "skipped" | "gone";

const SKIP_HOLD_MS = 7000;
const TOOK_HOLD_MS = 6000;

/**
 * The slot in the list: the card, and what it turns into. Take it: the card
 * folds away and, in its place, the task it became and a short confirmation
 * with Undo. Skip: it folds to a one-line note with Undo. After a while either
 * folds to nothing. A card is never overdue and never comes back as a red row.
 */
export function IdeaSlot({
  card,
  phase,
  busy,
  taken,
  addedLine,
  onTake,
  onSkip,
  onUndo,
  canUndo = true,
  onSeen,
  onSettled,
}: {
  card: IdeaCardData;
  phase: IdeaPhase;
  busy?: boolean;
  /** The row of the task it became, when the screen has it. */
  taken?: ReactNode;
  /** "Added to Today" and where else it went. */
  addedLine: string;
  onTake: () => void;
  onSkip: () => void;
  onUndo: () => void;
  /** False until the server has written the answer: there is nothing to undo yet. */
  canUndo?: boolean;
  onSeen?: () => void;
  /** The hold is over: the slot may fold to nothing. */
  onSettled: () => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  const settle = useRef(onSettled);
  settle.current = onSettled;

  // The hold starts when the server has the answer (there is something to
  // undo), not at the tap: a slow answer must not eat the person's time.
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!canUndo) return;
    if (phase === "skipped") {
      timer.current = window.setTimeout(() => settle.current(), SKIP_HOLD_MS);
    } else if (phase === "took") {
      timer.current = window.setTimeout(() => settle.current(), TOOK_HOLD_MS);
    }
    return () => window.clearTimeout(timer.current);
  }, [phase, canUndo]);

  return (
    <div
      className="ic-slot ic-phone"
      data-phase={phase}
      data-idea-slot={card.id}
    >
      <IdeaFold open={phase === "idea"}>
        <IdeaCard
          card={card}
          busy={busy}
          watch={phase === "idea"}
          onSeen={onSeen}
          onTake={onTake}
          onSkip={onSkip}
        />
      </IdeaFold>
      <IdeaFold open={phase === "took"}>
        {taken ? <div className="ic-landed">{taken}</div> : null}
        <div className="ic-added" data-idea-added="">
          <LuCheck size={12} aria-hidden="true" />
          <span>{addedLine}</span>
          <button
            type="button"
            className="ic-undo"
            disabled={!canUndo}
            onClick={onUndo}
          >
            {IDEA_COPY.undo}
          </button>
        </div>
      </IdeaFold>
      <IdeaFold open={phase === "skipped"}>
        <div className="ic-note" data-idea-note="">
          <span>{IDEA_COPY.hidden}</span>
          <button
            type="button"
            className="ic-undo"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <LuUndo2 size={14} aria-hidden="true" />
            {IDEA_COPY.undo}
          </button>
        </div>
      </IdeaFold>
    </div>
  );
}
