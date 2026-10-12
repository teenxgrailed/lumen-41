"use client";

/* The mini Needt UI on the glass cards around the sign-in form, onboarding and
   the paywall (prototype paywall-sheet.jsx: PwMiniTask, PwMiniEvent,
   PwMiniHabit, PwNoteCard, PwDateCard, PwMoodPrint). Illustrations, not
   controls: the hosts mark them aria-hidden. */
import type { CSSProperties } from "react";

import { LuCheck } from "react-icons/lu";

import { GlassCard } from "./Glass";

export function PwMiniTask({
  title,
  chip,
  done,
  style,
}: {
  title: string;
  chip?: string | null;
  done?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span className="pw-mini" style={style}>
      <span className={"pw-check" + (done ? " is-done" : "")}>
        {done ? <LuCheck size={9} /> : null}
      </span>
      <span
        style={
          done
            ? { color: "var(--mock-done-ink)", textDecoration: "line-through" }
            : undefined
        }
      >
        {title}
      </span>
      {chip ? <span className="pw-chip">{chip}</span> : null}
    </span>
  );
}

export function PwMiniEvent({
  time,
  title,
  hue,
  style,
}: {
  time: string;
  title: string;
  hue?: string;
  style?: CSSProperties;
}) {
  const h = hue || "var(--demo-hue-orange)";
  return (
    <span
      className="pw-mini"
      style={{
        background: `color-mix(in oklab, ${h} 10%, var(--color-white))`,
        gap: 8,
        ...style,
      }}
    >
      <span className="pw-mini-event-el" style={{ background: h }} />
      <span className="pw-mini-event-text">{time}</span>
      <span>{title}</span>
    </span>
  );
}

export function PwMiniHabit({
  title,
  streak,
  days,
  style,
}: {
  title: string;
  streak?: string;
  days?: readonly number[];
  style?: CSSProperties;
}) {
  const d = days || [1, 1, 1, 0, 1, 1, 1];
  return (
    <span className="pw-mini" style={style}>
      <span className="pw-mini-habit-row">
        {d.map((on, i) => (
          <span
            key={i}
            className="pw-mini-habit-el"
            style={{
              background: on
                ? "var(--demo-hue-green)"
                : "var(--mock-habit-off)",
            }}
          />
        ))}
      </span>
      <span>{title}</span>
      {streak ? (
        <span className="pw-chip pw-mini-habit-el-2">{streak}</span>
      ) : null}
    </span>
  );
}

export function PwNoteCard({
  width,
  style,
  className,
}: {
  width?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <GlassCard
      width={width || 176}
      pad={14}
      radius={18}
      caption="Daily note"
      className={className}
      style={style}
    >
      <span className="pw-note-card-col">
        <span className="pw-note-card-text">TUE · 1 SEP</span>
        <span className="pw-note-card-text-2">Shoot day</span>
        {(
          [
            ["Charge the flash", true],
            ["Scout Kreis 4", false],
            ["Reply to Tom", false],
          ] as const
        ).map(([t, d]) => (
          <span
            key={t}
            className="pw-note-card-row"
            style={{
              color: d ? "var(--text-tertiary)" : "var(--text-primary)",
              textDecoration: d ? "line-through" : "none",
            }}
          >
            <span
              className={
                "pw-check" + (d ? " is-done" : "") + " pw-note-card-el"
              }
              style={{
                boxShadow: d
                  ? "none"
                  : "var(--text-tertiary) 0 0 0 1.5px inset",
                background: d ? "var(--text-primary)" : "transparent",
              }}
            >
              {d ? <LuCheck size={8} /> : null}
            </span>
            {t}
          </span>
        ))}
        <span className="pw-note-card-el-2" />
        <span className="pw-note-card-el-3" />
      </span>
    </GlassCard>
  );
}

export function PwDateCard({
  width,
  style,
  className,
  event,
}: {
  width?: number;
  style?: CSSProperties;
  className?: string;
  event?: boolean;
}) {
  return (
    <GlassCard
      width={width || 120}
      pad={0}
      radius={18}
      className={className}
      style={style}
    >
      <span className="pw-date-card-col">
        <span className="pw-date-card-grid">SEP</span>
        <span className="px-display pw-date-card-text">1</span>
        <span className="pw-date-card-el">Tuesday</span>
        {event === false ? null : (
          <span className="pw-date-card-el-2">14:00 Shoot</span>
        )}
      </span>
    </GlassCard>
  );
}

export function PwMoodPrint({
  width,
  height,
  style,
  className,
}: {
  width?: number;
  height?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const w = width || 168;
  const h = height || 118;
  return (
    <GlassCard
      pad={6}
      radius={18}
      caption="Moodboard"
      className={className}
      style={{ width: w + 12, ...style }}
    >
      <span
        role="img"
        aria-label="A moodboard"
        className="pw-mood-print-grid"
        style={{ width: w, height: h }}
      >
        <span className="pw-mood-print-el" />
        <span className="pw-mood-print-el-2" />
        <span className="pw-mood-print-el-3" />
      </span>
    </GlassCard>
  );
}
