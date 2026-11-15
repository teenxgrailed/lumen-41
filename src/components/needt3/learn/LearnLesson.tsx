"use client";

/* One lesson (`/learn/[topicId]/[lessonId]`): a short read, then a few check
   questions (pick one, or type the answer), then Done. "Put in calendar"
   (Pro) gives it a time next to the person's plans. On Free the promo shows
   instead of a second lesson in one day, before it starts. */
import { type CSSProperties, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { LuCalendarPlus, LuCheck, LuChevronLeft, LuX } from "react-icons/lu";

import { useIsPro } from "@/components/needt3/paywall/Pro";

import { isSampleId } from "@/lib/learn/samples";
import {
  type LearnBlock,
  type LearnLessonBody,
  typedAnswerMatches,
} from "@/lib/learn/schema";
import {
  useLearn,
  useLearnTopic,
  useScheduleLesson,
  useSetLessonStatus,
} from "@/lib/needt3/hooks/learn";
import { usePlan } from "@/lib/needt3/hooks/plan";
import {
  type LearnLessonView as LessonData,
  canOpenLesson,
  findTopic,
  learnTopicHref,
  lessonSourceLine,
} from "@/lib/needt3/learn";
import { offersTrial } from "@/lib/needt3/paywall";
import { notify } from "@/lib/notifications";

import { LearnPromo, hueVar } from "./parts";

export function LearnLesson({
  topicId,
  lessonId,
}: {
  topicId: string;
  lessonId: string;
}) {
  const learn = useLearn();
  const own = useLearnTopic(topicId);
  const pro = useIsPro();
  const plan = usePlan();
  const router = useRouter();
  const setStatus = useSetLessonStatus();
  const schedule = useScheduleLesson();
  const [gate, setGate] = useState<"calendar" | null>(null);

  const sample = isSampleId(topicId);
  const topic = sample ? findTopic(learn.data, topicId) : (own.data ?? null);
  const lesson = topic?.lessons.find((l) => l.id === lessonId) ?? null;
  const back = learnTopicHref(topicId);

  if (!topic || !lesson)
    return (
      <div className="scroll-inner ln-screen" data-v3-screen="learn-lesson">
        <BackTo href={back} label={topic?.title ?? "Learning"} />
        {(sample && learn.data) || own.isError || (topic && !lesson) ? (
          <p className="ln-note">This lesson is not here any more.</p>
        ) : null}
      </div>
    );

  // Wait for today's count before deciding; a Free person never sees a lesson
  // flash open and then close.
  const blocked =
    !sample &&
    !!learn.data &&
    !canOpenLesson({ pro, lesson, today: learn.data.today });

  return (
    <LearnLessonView
      lesson={lesson}
      topicTitle={topic.title}
      color={topic.color}
      back={back}
      blocked={blocked}
      ready={sample || !!learn.data}
      sample={sample}
      gate={gate}
      trial={offersTrial(plan.data)}
      saving={setStatus.isPending}
      onCloseGate={() => setGate(null)}
      onDone={() => {
        if (sample) {
          notify.success(
            "Nice. Samples are not saved; make it yours to keep track."
          );
          return router.push(back);
        }
        setStatus.mutate(
          { lessonId, topicId, status: "done" },
          {
            onSuccess: () => router.push(back),
            onError: () => notify.error("Could not save that"),
          }
        );
      }}
      onSchedule={
        sample
          ? undefined
          : () => {
              if (!pro) return setGate("calendar");
              schedule.mutate(
                { lessonId, topicId },
                {
                  onSuccess: () =>
                    notify.success(`“${lesson.title}” is in your calendar`),
                  onError: () =>
                    notify.error("Could not add it to the calendar"),
                }
              );
            }
      }
    />
  );
}

export function LearnLessonView({
  lesson,
  topicTitle,
  color,
  back,
  blocked,
  ready,
  sample,
  gate,
  trial,
  saving,
  onCloseGate,
  onDone,
  onSchedule,
}: {
  lesson: LessonData;
  topicTitle: string;
  color: Parameters<typeof hueVar>[0];
  back: string;
  blocked: boolean;
  ready: boolean;
  sample: boolean;
  gate: "calendar" | null;
  trial: boolean;
  saving: boolean;
  onCloseGate: () => void;
  onDone: () => void;
  onSchedule?: () => void;
}) {
  if (!ready)
    return (
      <div
        className="scroll-inner ln-screen"
        data-v3-screen="learn-lesson"
        aria-busy="true"
      />
    );
  if (blocked)
    return (
      <div className="scroll-inner ln-screen" data-v3-screen="learn-lesson">
        <BackTo href={back} label={topicTitle} />
        <LearnPromo reason="limit" trial={trial} />
      </div>
    );
  return (
    <div
      className="scroll-inner ln-screen ln-lesson"
      data-v3-screen="learn-lesson"
      style={{ "--ln-card-hue": hueVar(color) } as CSSProperties}
    >
      <BackTo href={back} label={topicTitle} />
      <header className="ln-head is-lesson">
        <span className="ln-head-meta">
          {sample ? "Sample · " : ""}
          {lessonSourceLine(lesson)}
        </span>
        <h1 className="ln-title is-lesson">{lesson.title}</h1>
      </header>
      {lesson.body ? <LessonBody body={lesson.body} /> : null}
      {gate ? (
        <LearnPromo reason={gate} trial={trial} onClose={onCloseGate} />
      ) : null}
      <div className="ln-lesson-actions">
        <button
          type="button"
          className="nx-btn nx-btn-primary"
          data-ln-done=""
          disabled={saving}
          onClick={onDone}
        >
          <LuCheck size={14} aria-hidden />
          {lesson.status === "done" ? "Back to topic" : "Done"}
        </button>
        {onSchedule ? (
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            data-ln-schedule=""
            disabled={!!lesson.scheduledTaskId}
            onClick={onSchedule}
          >
            <LuCalendarPlus size={14} aria-hidden />
            {lesson.scheduledTaskId ? "In your calendar" : "Put in calendar"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LessonBody({ body }: { body: LearnLessonBody }) {
  let q = 0;
  return (
    <div className="ln-body">
      {body.blocks.map((b, i) =>
        b.kind === "text" ? (
          <p key={i} className="ln-read">
            {b.text}
          </p>
        ) : (
          <Question key={i} block={b} n={++q} />
        )
      )}
    </div>
  );
}

function Question({
  block,
  n,
}: {
  block: Exclude<LearnBlock, { kind: "text" }>;
  n: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);

  if (block.kind === "choice") {
    const right = picked !== null && picked === block.answer;
    return (
      <section
        className="ln-q nx-swap"
        data-ln-q="choice"
        data-ln-q-state={picked === null ? "" : right ? "right" : "wrong"}
      >
        <h2 className="ln-q-title">
          <span className="ln-q-n">{n}</span>
          {block.question}
        </h2>
        <div className="ln-q-options" role="group" aria-label={block.question}>
          {block.options.map((o, i) => (
            <button
              key={i}
              type="button"
              className={
                "ln-q-option" +
                (picked === null
                  ? ""
                  : i === block.answer
                    ? " is-right"
                    : i === picked
                      ? " is-wrong"
                      : "")
              }
              aria-pressed={picked === i}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
            >
              {o}
            </button>
          ))}
        </div>
        {picked !== null ? <Verdict right={right} /> : null}
      </section>
    );
  }
  return (
    <section
      className="ln-q nx-swap"
      data-ln-q="type"
      data-ln-q-state={checked === null ? "" : checked ? "right" : "wrong"}
    >
      <h2 className="ln-q-title">
        <span className="ln-q-n">{n}</span>
        {block.question}
      </h2>
      <form
        className="ln-q-type"
        onSubmit={(e) => {
          e.preventDefault();
          setChecked(typedAnswerMatches(block, typed));
        }}
      >
        <input
          className="pl-field ln-q-input"
          value={typed}
          aria-label="Your answer"
          placeholder="Type the answer"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setTyped(e.target.value);
            setChecked(null);
          }}
        />
        <button
          type="submit"
          className="nx-btn nx-btn-secondary"
          disabled={!typed.trim()}
        >
          Check
        </button>
      </form>
      {checked !== null ? (
        <Verdict right={checked} answer={checked ? undefined : block.answer} />
      ) : null}
    </section>
  );
}

function Verdict({ right, answer }: { right: boolean; answer?: string }) {
  return (
    <p className={"ln-verdict" + (right ? " is-right" : " is-wrong")}>
      {right ? (
        <LuCheck size={14} aria-hidden />
      ) : (
        <LuX size={14} aria-hidden />
      )}
      {right
        ? "Right"
        : answer
          ? `Not quite. It is “${answer}”.`
          : "Not quite."}
    </p>
  );
}

function BackTo({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="ln-back" data-ln-back="">
      <LuChevronLeft size={16} aria-hidden />
      {label}
    </Link>
  );
}
