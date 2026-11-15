"use client";

/* A topic (`/learn/[topicId]`): its title and goal, chips to filter the
   lessons (All / New / Done), "Generate lessons" (Pro, AI), and the lessons as
   the overlapping card stack. Free meets the promo before a second lesson of
   the day opens, never inside one. */
import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { LuChevronLeft, LuWandSparkles } from "react-icons/lu";

import { useIsPro } from "@/components/needt3/paywall/Pro";

import { isSampleId } from "@/lib/learn/samples";
import {
  useCreateTopic,
  useGenerateLessons,
  useLearn,
  useLearnTopic,
  useScheduleLesson,
} from "@/lib/needt3/hooks/learn";
import { usePlan } from "@/lib/needt3/hooks/plan";
import {
  LEARN_HREF,
  type LearnLessonView,
  type LearnOverview,
  type LessonFilter,
  type LearnTopicView as TopicData,
  canOpenLesson,
  filterLessons,
  findTopic,
  learnLessonHref,
  learnTopicHref,
  topicCountLine,
} from "@/lib/needt3/learn";
import { offersTrial } from "@/lib/needt3/paywall";
import { notify } from "@/lib/notifications";

import { LessonStack } from "./LessonStack";
import { LearnChips, LearnPromo } from "./parts";

const FILTERS: readonly { key: LessonFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "To learn" },
  { key: "done", label: "Done" },
];

export function LearnTopic({ topicId }: { topicId: string }) {
  const learn = useLearn();
  const own = useLearnTopic(topicId);
  const pro = useIsPro();
  const plan = usePlan();
  const router = useRouter();
  const generate = useGenerateLessons();
  const schedule = useScheduleLesson();
  const adopt = useCreateTopic();
  const [promo, setPromo] = useState<"limit" | "ai" | "calendar" | null>(null);

  const sample = isSampleId(topicId);
  const topic = sample ? findTopic(learn.data, topicId) : (own.data ?? null);
  const missing = sample ? !topic : own.isError;

  return (
    <LearnTopicView
      topic={topic}
      missing={missing}
      pro={pro}
      today={learn.data?.today}
      promo={promo}
      trial={offersTrial(plan.data)}
      generating={generate.isPending}
      scheduling={
        schedule.isPending ? (schedule.variables?.lessonId ?? null) : null
      }
      onClosePromo={() => setPromo(null)}
      onStart={(lesson) => {
        if (
          !canOpenLesson({ pro, lesson, today: learn.data?.today }) &&
          !sample
        )
          return setPromo("limit");
        router.push(learnLessonHref(topicId, lesson.id));
      }}
      onGenerate={() => {
        if (!pro) return setPromo("ai");
        generate.mutate(topicId, {
          onSuccess: (r) => {
            if (r.status === "ready") notify.success("New lessons are ready");
            else if (r.status === "upgrade") setPromo("ai");
            else
              notify.error(
                "Could not write lessons right now. Try again later."
              );
          },
          onError: () => notify.error("Could not write lessons right now"),
        });
      }}
      onSchedule={
        sample
          ? undefined
          : (lesson) => {
              if (!pro) return setPromo("calendar");
              schedule.mutate(
                { lessonId: lesson.id, topicId },
                {
                  onSuccess: () =>
                    notify.success(`“${lesson.title}” is in your calendar`),
                  onError: () =>
                    notify.error("Could not add it to the calendar"),
                }
              );
            }
      }
      onMakeMine={
        sample && topic?.sampleKey
          ? () =>
              adopt.mutate(
                { sample: topic.sampleKey as string },
                {
                  onSuccess: (t) => router.replace(learnTopicHref(t.id)),
                  onError: () => notify.error("Could not copy the sample"),
                }
              )
          : undefined
      }
    />
  );
}

export function LearnTopicView({
  topic,
  missing,
  pro,
  today,
  promo,
  trial,
  generating,
  scheduling,
  onClosePromo,
  onStart,
  onGenerate,
  onSchedule,
  onMakeMine,
}: {
  topic: TopicData | null;
  missing: boolean;
  pro: boolean;
  today: LearnOverview["today"] | undefined;
  promo: "limit" | "ai" | "calendar" | null;
  trial: boolean;
  generating: boolean;
  scheduling: string | null;
  onClosePromo: () => void;
  onStart: (lesson: LearnLessonView) => void;
  onGenerate: () => void;
  onSchedule?: (lesson: LearnLessonView) => void;
  onMakeMine?: () => void;
}) {
  const [filter, setFilter] = useState<LessonFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  if (missing)
    return (
      <div className="scroll-inner ln-screen" data-v3-screen="learn-topic">
        <BackLink />
        <p className="ln-note">This topic is not here any more.</p>
      </div>
    );
  if (!topic)
    return (
      <div
        className="scroll-inner ln-screen"
        data-v3-screen="learn-topic"
        aria-busy="true"
      />
    );

  const lessons = filterLessons(topic.lessons, filter);
  const free =
    !pro && today
      ? `${Math.max(0, (today.limit ?? 1) - today.completed)} free lesson left today`
      : null;

  return (
    <div className="scroll-inner ln-screen" data-v3-screen="learn-topic">
      <BackLink />
      <header className="ln-head is-topic">
        <h1 className="ln-title">{topic.title}</h1>
        <span className="ln-head-meta">
          {[topic.sample ? "Sample" : null, topic.level, topicCountLine(topic)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {topic.goal ? <p className="ln-goal">{topic.goal}</p> : null}
      </header>

      <div className="ln-bar">
        <LearnChips
          label="Show"
          items={FILTERS}
          current={filter}
          onPick={setFilter}
        />
        <div className="ln-bar-actions">
          {onMakeMine ? (
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              data-ln-make-mine=""
              onClick={onMakeMine}
            >
              Make it mine
            </button>
          ) : (
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              data-ln-generate=""
              disabled={generating}
              onClick={onGenerate}
            >
              <LuWandSparkles size={14} aria-hidden />
              {generating ? "Writing lessons…" : "Generate lessons"}
            </button>
          )}
        </div>
      </div>

      {free ? <p className="ln-note">{free}</p> : null}

      {promo ? (
        <LearnPromo reason={promo} trial={trial} onClose={onClosePromo} />
      ) : null}

      {lessons.length ? (
        <LessonStack
          lessons={lessons}
          color={topic.color}
          icon={topic.icon}
          openId={openId}
          onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
          onStart={onStart}
          onSchedule={onSchedule}
          scheduling={scheduling}
        />
      ) : (
        <p className="ln-note" data-ln-empty="">
          {topic.lessons.length
            ? filter === "done"
              ? "Nothing done yet."
              : "Everything here is done."
            : pro
              ? "No lessons yet. Generate lessons and Needt writes the first five."
              : "No lessons yet. With Pro, Needt writes them for you."}
        </p>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href={LEARN_HREF} className="ln-back" data-ln-back="">
      <LuChevronLeft size={16} aria-hidden />
      Learning
    </Link>
  );
}
