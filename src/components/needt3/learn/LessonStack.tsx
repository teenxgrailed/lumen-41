"use client";

/* A topic's lessons as a stack of large rounded cards in the topic's wash,
   each overlapping the one above like tabs: title, a source line ("AI · 6
   min") and a round mark with faint dashed circles on the right. Tapping a
   card raises it to the front and opens it (one rise-and-settle, no spring);
   tapping again, or another card, lets it settle back. */
import type { CSSProperties } from "react";

import { LuCalendarPlus, LuCheck } from "react-icons/lu";

import type { LearnColor, LearnIcon } from "@/lib/learn/schema";
import { type LearnLessonView, lessonSourceLine } from "@/lib/needt3/learn";

import { LearnGlyph, hueVar } from "./parts";

export interface LessonStackProps {
  lessons: readonly LearnLessonView[];
  color: LearnColor;
  icon: LearnIcon | null;
  openId: string | null;
  onToggle: (lessonId: string) => void;
  onStart: (lesson: LearnLessonView) => void;
  /** Absent: no calendar action (a sample). */
  onSchedule?: (lesson: LearnLessonView) => void;
  scheduling?: string | null;
}

/** The washes cards cycle through after the topic's own, so neighbours differ. */
const CYCLE: readonly LearnColor[] = ["violet", "plain", "amber", "green"];

export function cardColor(base: LearnColor, index: number): LearnColor {
  if (index === 0) return base;
  const start = Math.max(0, CYCLE.indexOf(base));
  return CYCLE[(start + index) % CYCLE.length];
}

export function LessonStack({
  lessons,
  color,
  icon,
  openId,
  onToggle,
  onStart,
  onSchedule,
  scheduling,
}: LessonStackProps) {
  return (
    <ol className="ln-stack" data-ln-stack="">
      {lessons.map((l, i) => {
        const open = l.id === openId;
        const c = cardColor(color, i);
        return (
          <li
            key={l.id}
            className={
              "ln-card nx-swap" +
              (open ? " is-open" : "") +
              (l.status === "done" ? " is-done" : "")
            }
            style={
              {
                animationDelay: `${i * 55}ms`,
                zIndex: open ? lessons.length + 1 : i + 1,
                "--ln-card-hue": hueVar(c),
              } as CSSProperties
            }
            data-ln-card={l.id}
            data-ln-color={c}
          >
            <button
              type="button"
              className="ln-card-hit"
              aria-expanded={open}
              onClick={() => onToggle(l.id)}
            >
              <span className="ln-card-text">
                <span className="ln-card-title">{l.title}</span>
                <span className="ln-card-source">
                  {l.status === "done" ? (
                    <>
                      <LuCheck size={12} aria-hidden /> Done ·{" "}
                    </>
                  ) : null}
                  {lessonSourceLine(l)}
                </span>
              </span>
              <span className="ln-card-mark" aria-hidden="true">
                <span className="ln-card-ring is-1" />
                <span className="ln-card-ring is-2" />
                <span className="ln-card-dot">
                  <LearnGlyph icon={icon} size={20} />
                </span>
              </span>
            </button>
            {open ? (
              <div className="ln-card-more" data-ln-card-more="">
                <button
                  type="button"
                  className="nx-btn nx-btn-primary"
                  data-ln-start={l.id}
                  onClick={() => onStart(l)}
                >
                  {l.status === "done" ? "Read again" : "Start lesson"}
                </button>
                {onSchedule ? (
                  <button
                    type="button"
                    className="nx-btn nx-btn-secondary"
                    data-ln-schedule={l.id}
                    disabled={!!l.scheduledTaskId || scheduling === l.id}
                    onClick={() => onSchedule(l)}
                  >
                    <LuCalendarPlus size={14} aria-hidden />
                    {l.scheduledTaskId ? "In your calendar" : "Put in calendar"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
