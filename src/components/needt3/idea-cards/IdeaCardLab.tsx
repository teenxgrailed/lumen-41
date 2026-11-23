"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";

import { PkTaskRow } from "@/components/needt3/phone/kit/Row";
import { Task } from "@/components/needt3/task/Task";

import type { V3Task } from "@/lib/needt3/map";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { PlanDate, PlanWeekday } from "../phone/home/PlanToday";
import { TaskGlyph } from "../phone/home/TaskGlyph";
import { IdeaMovedNote, IdeaSlot } from "./IdeaCard";
import {
  DAY_AFTER,
  DAY_BEFORE,
  LAB_PROJECTS,
  LAB_TODAY,
  MAIN_TASKS,
  takenTask,
} from "./idea-fixtures";
import {
  IDEAS,
  type IdeaData,
  type IdeaLang,
  type IdeaLayout,
  type IdeaPhase,
  type IdeaVariant,
} from "./idea-model";

const NOOP = () => undefined;

const VARIANTS: readonly {
  id: IdeaVariant;
  name: string;
  line: string;
}[] = [
  {
    id: 1,
    name: "V1 · Soft raised card",
    line: "The volume material: layered soft shadows, a light rim, an inner highlight. A tile in the object's own colour and a small Idea label.",
  },
  {
    id: 2,
    name: "V2 · Dashed ghost",
    line: "No fill, a dashed outline, a sparkle in the object's colour. It reads as optional before it reads as a task.",
  },
  {
    id: 3,
    name: "V3 · Sponsored slot",
    line: "A thin top label (Idea for today, Optional), the object's colour as texture plus grain, pill buttons.",
  },
];

const PHASE_OF: Record<string, IdeaPhase> = {
  normal: "idea",
  idea: "idea",
  took: "took",
  skipped: "skipped",
  gone: "gone",
  moved: "idea",
};

function projectOf(t: V3Task) {
  return LAB_PROJECTS.find((p) => p.id === t.projectId) ?? null;
}

function takenFor(idea: IdeaData, lang: IdeaLang): V3Task {
  const projectId = idea.project === "Learning" ? "learn" : "inspo";
  return takenTask(idea.task[lang], projectId, idea.minutes);
}

/** The phone's Today as the day plan draws it: big rows, then compact ones. */
function PhoneFrame({
  variant,
  phase,
  idea,
  lang,
  moved,
  onMovedUndo,
}: {
  variant: IdeaVariant;
  phase?: IdeaPhase;
  idea: IdeaData;
  lang: IdeaLang;
  moved?: boolean;
  onMovedUndo?: () => void;
}) {
  const row = (t: V3Task, size: "big" | "compact") => (
    <PkTaskRow
      key={t.id}
      t={t}
      project={projectOf(t)}
      size={size}
      hideDue
      icon={<TaskGlyph title={t.title} />}
      onCheck={NOOP}
    />
  );
  return (
    <div className="ic-frame ic-frame-phone" data-ic-frame="phone">
      <div className="ic-ph-head">
        <PlanWeekday weekday="Mon" />
        <PlanDate date="23 Nov" year="2026" />
      </div>
      {moved ? (
        <IdeaMovedNote lang={lang} count={3} onUndo={onMovedUndo} />
      ) : null}
      <div className="v2p-day dp-list">
        <div className="dp-group dp-main">
          {MAIN_TASKS.map((t) => row(t, "big"))}
        </div>
        <div className="dp-group dp-rest">
          <section className="dp-part">
            <p className="dp-label">
              Day<span>3</span>
            </p>
            {DAY_BEFORE.map((t) => row(t, "compact"))}
            <IdeaSlot
              variant={variant}
              layout="phone"
              idea={idea}
              lang={lang}
              phase={phase}
              renderTaken={() => row(takenFor(idea, lang), "compact")}
            />
            {DAY_AFTER.map((t) => row(t, "compact"))}
          </section>
        </div>
      </div>
    </div>
  );
}

/** The desktop's Today column on the canvas: the task rows of the app. */
function DesktopFrame({
  variant,
  phase,
  idea,
  lang,
  moved,
  onMovedUndo,
}: {
  variant: IdeaVariant;
  phase?: IdeaPhase;
  idea: IdeaData;
  lang: IdeaLang;
  moved?: boolean;
  onMovedUndo?: () => void;
}) {
  const row = (t: V3Task): ReactNode => (
    <Task
      key={t.id}
      task={t}
      layout="row"
      projects={LAB_PROJECTS}
      today={LAB_TODAY}
      onToggle={NOOP}
      hideDue
    />
  );
  return (
    <div className="ic-frame ic-frame-desktop" data-ic-frame="desktop">
      <div className="ic-col">
        <div className="ic-col-head">
          Monday 23 Nov
          <span>5 tasks · 3 h 15 min</span>
        </div>
        {moved ? (
          <div className="ic-desktop-moved">
            <IdeaMovedNote lang={lang} count={3} onUndo={onMovedUndo} />
          </div>
        ) : null}
        <p className="ic-label-d">Morning</p>
        {MAIN_TASKS.map(row)}
        <p className="ic-label-d">Day</p>
        {DAY_BEFORE.map(row)}
        <IdeaSlot
          variant={variant}
          layout="desktop"
          idea={idea}
          lang={lang}
          phase={phase}
          renderTaken={() => row(takenFor(idea, lang))}
        />
        {DAY_AFTER.map(row)}
      </div>
    </div>
  );
}

function Frame({
  layout,
  ...rest
}: {
  layout: IdeaLayout;
  variant: IdeaVariant;
  phase?: IdeaPhase;
  idea: IdeaData;
  lang: IdeaLang;
  moved?: boolean;
  onMovedUndo?: () => void;
}) {
  return layout === "phone" ? (
    <PhoneFrame {...rest} />
  ) : (
    <DesktopFrame {...rest} />
  );
}

function Chips<T extends string>({
  value,
  options,
  onPick,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <div className="icl-bar" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          className="icl-chip"
          aria-pressed={value === id}
          onClick={() => onPick(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Idea cards, three skins, each between real task rows of a Today mock, on
 * the phone (390) and the desktop (1440). Admin only (the layout's check);
 * demo content, nothing is sent. Open `?v=1|2|3&mode=phone|desktop&s=normal|
 * took|skipped&theme=light|dark&lang=en|ru&idea=1|2` for one frame at one
 * state (the shots do); without them every card is live: Take it, Skip, Undo.
 */
export function IdeaCardLab() {
  const params = useSearchParams();
  const setTheme = useNeedt3Ui((s) => s.setTheme);
  const theme = useNeedt3Ui((s) => s.theme);
  const [lang, setLang] = useState<IdeaLang>(
    params.get("lang") === "ru" ? "ru" : "en"
  );
  const [ix, setIx] = useState<number>(params.get("idea") === "2" ? 1 : 0);
  const [round, setRound] = useState(0);
  const [showMoved, setShowMoved] = useState(false);
  const idea = IDEAS[ix] ?? IDEAS[0];

  const wanted = params.get("theme");
  useEffect(() => {
    if (wanted !== "light" && wanted !== "dark") return undefined;
    // V3Root seeds the saved look on mount; the lab's pick lands after it.
    const id = window.setTimeout(() => setTheme(wanted), 60);
    return () => window.clearTimeout(id);
  }, [wanted, setTheme]);

  const v = Number(params.get("v"));
  const mode = params.get("mode");
  if (
    (v === 1 || v === 2 || v === 3) &&
    (mode === "phone" || mode === "desktop")
  ) {
    const phase = PHASE_OF[params.get("s") ?? "normal"] ?? "idea";
    return (
      <div className="icl" data-testid="idea-cards-shot" data-shot="">
        <Frame
          layout={mode}
          variant={v}
          phase={phase}
          idea={idea}
          lang={lang}
          moved={params.get("s") === "moved"}
        />
      </div>
    );
  }

  return (
    <div className="icl" data-testid="idea-cards-lab">
      <h1>Idea cards lab</h1>
      <p className="icl-lede">
        An optional activity (&quot;read AI agents news&quot;) is not a deadline
        task, so it never turns red. It shows as a card between two tasks, at
        most once or twice a day. Take it makes it a task now; Skip folds it
        away with an Undo. Demo content only.
      </p>
      <Chips
        label="Theme"
        value={theme === "dark" ? "dark" : "light"}
        options={[
          ["light", "Light"],
          ["dark", "Dark"],
        ]}
        onPick={(t) => setTheme(t)}
      />
      <Chips
        label="Language"
        value={lang}
        options={[
          ["en", "English"],
          ["ru", "Русский"],
        ]}
        onPick={setLang}
      />
      <Chips
        label="Idea"
        value={String(ix) as "0" | "1"}
        options={[
          ["0", "AI agents news"],
          ["1", "Watch a breakdown"],
        ]}
        onPick={(i) => setIx(Number(i))}
      />
      <button
        type="button"
        className="icl-chip"
        aria-pressed={showMoved}
        onClick={() => setShowMoved((m) => !m)}
      >
        Moved-to-ideas notice
      </button>{" "}
      <button
        type="button"
        className="icl-chip"
        onClick={() => setRound((r) => r + 1)}
      >
        Reset all cards
      </button>
      {VARIANTS.map((vv) => (
        <section key={vv.id} className="icl-sec" data-variant={vv.id}>
          <h2>{vv.name}</h2>
          <p>{vv.line}</p>
          <div className="icl-row">
            <Frame
              key={`p${round}${ix}${lang}`}
              layout="phone"
              variant={vv.id}
              idea={idea}
              lang={lang}
              moved={showMoved}
              onMovedUndo={() => setShowMoved(false)}
            />
            <Frame
              key={`d${round}${ix}${lang}`}
              layout="desktop"
              variant={vv.id}
              idea={idea}
              lang={lang}
              moved={showMoved}
              onMovedUndo={() => setShowMoved(false)}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
