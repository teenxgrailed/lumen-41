"use client";

/* Learn's overview (`/learn`): the big "Learning" title, a row of the
   person's topics as chips (+ New topic), and the topics as folders with
   their next lessons sticking out. With no topic of their own the built-in
   samples show, marked as samples, each with "Make it mine". */
import { useRouter } from "next/navigation";

import { LuPlus } from "react-icons/lu";

import { useIsPro } from "@/components/needt3/paywall/Pro";

import { useCreateTopic, useLearn } from "@/lib/needt3/hooks/learn";
import {
  LEARN_NEW_HREF,
  type LearnOverview as LearnOverviewData,
  type LearnTopicView,
  learnTopicHref,
  lessonSourceLine,
  shownTopics,
} from "@/lib/needt3/learn";
import { notify } from "@/lib/notifications";

import { LearnFolder } from "./LearnFolder";
import { LearnFrame } from "./LearnFrame";
import { LearnChips, LearnGlyph, hueVar } from "./parts";

function LearnOverviewScreen() {
  const learn = useLearn();
  const pro = useIsPro();
  const router = useRouter();
  const adopt = useCreateTopic();
  return (
    <LearnOverviewView
      data={learn.data}
      pro={pro}
      onOpen={(id) => router.push(learnTopicHref(id))}
      onNew={() => router.push(LEARN_NEW_HREF)}
      onMakeMine={(sampleKey) =>
        adopt.mutate(
          { sample: sampleKey },
          {
            onSuccess: (t) => {
              notify.success(`“${t.title}” is yours now`);
              router.push(learnTopicHref(t.id));
            },
            onError: () => notify.error("Could not copy the sample"),
          }
        )
      }
    />
  );
}

/** The overview, from data (pure: the DOM test renders this). */
export function LearnOverviewView({
  data,
  pro,
  onOpen,
  onNew,
  onMakeMine,
}: {
  data: LearnOverviewData | undefined;
  pro: boolean;
  onOpen: (topicId: string) => void;
  onNew: () => void;
  onMakeMine: (sampleKey: string) => void;
}) {
  const topics = shownTopics(data);
  const samples = !!topics && topics.length > 0 && topics[0].sample;
  const today = data?.today;
  const meta =
    !pro && today
      ? today.completed >= (today.limit ?? 1)
        ? "Today's free lesson is done"
        : "One free lesson a day"
      : null;

  return (
    <div className="scroll-inner ln-screen" data-v3-screen="learn">
      <header className="ln-head">
        <h1 className="ln-title">Learning</h1>
        {meta ? <span className="ln-head-meta">{meta}</span> : null}
      </header>

      {topics ? (
        <LearnChips
          label="Topics"
          items={[
            ...topics.map((t) => ({
              key: t.id,
              label: t.title,
              icon: <LearnGlyph icon={t.icon} size={14} />,
              onClick: () => onOpen(t.id),
            })),
            {
              key: "__new",
              label: "New topic",
              icon: <LuPlus size={14} aria-hidden />,
              onClick: onNew,
            },
          ]}
        />
      ) : null}

      {samples ? (
        <p className="ln-note" data-ln-samples="">
          Samples to show how Learn works. Make one yours, or start your own
          topic.
        </p>
      ) : null}

      {topics ? (
        <div className="ln-folders" data-ln-folders="">
          {topics.map((t, i) => (
            <TopicFolder
              key={t.id}
              topic={t}
              index={i}
              onOpen={() => onOpen(t.id)}
              onMakeMine={
                t.sample && t.sampleKey
                  ? () => onMakeMine(t.sampleKey as string)
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TopicFolder({
  topic,
  index,
  onOpen,
  onMakeMine,
}: {
  topic: LearnTopicView;
  index: number;
  onOpen: () => void;
  onMakeMine?: () => void;
}) {
  const open = topic.lessons.filter((l) => l.status !== "done");
  const peeks = (open.length ? open : topic.lessons).slice(0, 3);
  return (
    <div
      className="ln-folder-cell nx-swap"
      style={{ animationDelay: `${index * 55}ms` }}
      data-ln-topic={topic.id}
    >
      <LearnFolder
        label={topic.title}
        count={open.length}
        hue={hueVar(topic.color)}
        sticker={<LearnGlyph icon={topic.icon} size={18} />}
        peeks={peeks.map((l) => ({
          key: l.id,
          title: l.title,
          meta: lessonSourceLine(l),
        }))}
        caption={
          topic.sample
            ? "Sample"
            : open[0]
              ? `Next: ${open[0].title}`
              : topic.lessons.length
                ? "All done"
                : "No lessons yet"
        }
        onClick={onOpen}
        ariaLabel={`Open ${topic.title}, ${open.length} to learn`}
      />
      {onMakeMine ? (
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm ln-mine"
          data-ln-make-mine={topic.sampleKey ?? ""}
          onClick={onMakeMine}
        >
          Make it mine
        </button>
      ) : null}
    </div>
  );
}

/** `/learn`, in the phone kit's screen on the phone. */
export function LearnOverview() {
  return (
    <LearnFrame screen="learn">
      <LearnOverviewScreen />
    </LearnFrame>
  );
}
