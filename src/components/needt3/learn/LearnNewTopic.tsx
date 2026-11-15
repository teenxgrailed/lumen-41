"use client";

/* A new topic (`/learn/new`): a name, and if the person likes a goal and a
   level, a wash and a sticker. Creating it is free; "Create and generate"
   then asks the AI for the first lessons (Pro). Free creates the topic and
   meets the promo where the lessons would come from. */
import { type CSSProperties, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { LuChevronLeft } from "react-icons/lu";

import { useIsPro } from "@/components/needt3/paywall/Pro";

import {
  LEARN_COLORS,
  LEARN_ICONS,
  LEARN_LIMITS,
  type LearnColor,
  type LearnIcon,
  type LearnTopicInput,
} from "@/lib/learn/schema";
import { useCreateTopic, useGenerateLessons } from "@/lib/needt3/hooks/learn";
import { LEARN_HREF, learnTopicHref } from "@/lib/needt3/learn";
import { notify } from "@/lib/notifications";

import { LearnFrame } from "./LearnFrame";
import { LearnGlyph, hueVar } from "./parts";

export interface NewTopicForm {
  title: string;
  goal: string;
  level: string;
  color: LearnColor;
  icon: LearnIcon;
}

export const EMPTY_TOPIC: NewTopicForm = {
  title: "",
  goal: "",
  level: "",
  color: "violet",
  icon: "book",
};

/** The form as a `POST /api/learn/topics` body: empty optional fields left out. */
export function topicInputFrom(f: NewTopicForm): LearnTopicInput {
  return {
    title: f.title.trim(),
    color: f.color,
    icon: f.icon,
    ...(f.goal.trim() ? { goal: f.goal.trim() } : {}),
    ...(f.level.trim() ? { level: f.level.trim() } : {}),
  };
}

function LearnNewTopicScreen() {
  const router = useRouter();
  const pro = useIsPro();
  const create = useCreateTopic();
  const generate = useGenerateLessons();
  const [form, setForm] = useState<NewTopicForm>(EMPTY_TOPIC);
  const busy = create.isPending || generate.isPending;

  const submit = (withLessons: boolean) => {
    if (!form.title.trim() || busy) return;
    create.mutate(topicInputFrom(form), {
      onSuccess: (topic) => {
        if (!withLessons || !pro) return router.push(learnTopicHref(topic.id));
        generate.mutate(topic.id, {
          onSettled: (r) => {
            if (r && r.status !== "ready")
              notify.error(
                "The topic is saved; the lessons could not be written yet."
              );
            router.push(learnTopicHref(topic.id));
          },
        });
      },
      onError: () => notify.error("Could not create the topic"),
    });
  };

  return (
    <div className="scroll-inner ln-screen" data-v3-screen="learn-new">
      <Link href={LEARN_HREF} className="ln-back" data-ln-back="">
        <LuChevronLeft size={16} aria-hidden />
        Learning
      </Link>
      <header className="ln-head">
        <h1 className="ln-title">New topic</h1>
        <span className="ln-head-meta">
          You name it; Needt writes the lessons
        </span>
      </header>
      <form
        className="ln-form nx-swap"
        onSubmit={(e) => {
          e.preventDefault();
          submit(true);
        }}
      >
        <label className="form-row">
          <span className="form-label">Topic</span>
          <input
            className="pl-field"
            value={form.title}
            maxLength={LEARN_LIMITS.title}
            placeholder="Deutsch, design, investing…"
            autoFocus
            data-ln-field="title"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="form-row">
          <span className="form-label">Goal</span>
          <input
            className="pl-field"
            value={form.goal}
            maxLength={LEARN_LIMITS.goal}
            placeholder="Optional: what it is for"
            data-ln-field="goal"
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
          />
        </label>
        <label className="form-row">
          <span className="form-label">Level</span>
          <input
            className="pl-field"
            value={form.level}
            maxLength={LEARN_LIMITS.level}
            placeholder="Optional: A2, beginner…"
            data-ln-field="level"
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          />
        </label>
        <div className="form-row">
          <span className="form-label">Colour</span>
          <span className="ln-swatches" role="radiogroup" aria-label="Colour">
            {LEARN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color === c}
                aria-label={c}
                className={"ln-swatch" + (form.color === c ? " is-on" : "")}
                style={{ "--ln-card-hue": hueVar(c) } as CSSProperties}
                onClick={() => setForm({ ...form, color: c })}
              />
            ))}
          </span>
        </div>
        <div className="form-row">
          <span className="form-label">Sticker</span>
          <span className="ln-icons" role="radiogroup" aria-label="Sticker">
            {LEARN_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                role="radio"
                aria-checked={form.icon === ic}
                aria-label={ic}
                className={"ln-icon-pick" + (form.icon === ic ? " is-on" : "")}
                onClick={() => setForm({ ...form, icon: ic })}
              >
                <LearnGlyph icon={ic} size={16} />
              </button>
            ))}
          </span>
        </div>
        <div className="ln-form-actions">
          <button
            type="button"
            className="nx-btn nx-btn-text"
            disabled={!form.title.trim() || busy}
            onClick={() => submit(false)}
            data-ln-create-only=""
          >
            Create
          </button>
          <button
            type="submit"
            className="nx-btn nx-btn-primary"
            disabled={!form.title.trim() || busy}
            data-ln-create=""
          >
            {busy
              ? "Writing lessons…"
              : pro
                ? "Create and generate lessons"
                : "Create topic"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** `/learn/new`, in the phone kit's screen on the phone. */
export function LearnNewTopic() {
  return (
    <LearnFrame screen="learn-new">
      <LearnNewTopicScreen />
    </LearnFrame>
  );
}
