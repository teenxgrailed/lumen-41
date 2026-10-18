"use client";

import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

import { usePersonalDay } from "@/lib/needt3/hooks/personal";
import type { PersonalTone } from "@/lib/personal-time";
import { type DayBand, bandTimeLabel } from "@/lib/personal-time-days";

export interface PersonalBandProps {
  title: string;
  emoji: string;
  tone: PersonalTone;
  /** "13:00–14:00". Shown after the name when there is room. */
  time?: string;
  /** `grid`: a full-width stripe behind a calendar column. `row`: a line in a list. */
  variant?: "grid" | "row";
  /** Too short for words: the emoji alone, the name in the tooltip. */
  compact?: boolean;
  repeating?: boolean;
  linked?: boolean;
  blockId?: string;
  style?: CSSProperties;
  onOpen?: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * A stretch of personal time: calm, softly tinted, full width, with the emoji
 * and the name. It is the person's own time, not work, so it has no card, no
 * border and no shadow, and it never takes the accent: the tint is a low alpha
 * of an existing palette colour (see personal-band.css).
 */
export function PersonalBand({
  title,
  emoji,
  tone,
  time,
  variant = "grid",
  compact = false,
  repeating,
  linked,
  blockId,
  style,
  onOpen,
}: PersonalBandProps) {
  const label = `${title}, personal time${time ? `, ${time}` : ""}`;
  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (!onOpen || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onOpen(e as unknown as MouseEvent<HTMLElement>);
  };
  return (
    <div
      data-personal-band={blockId ?? ""}
      data-tone={tone}
      data-variant={variant}
      data-repeating={repeating ? "" : undefined}
      data-linked={linked ? "" : undefined}
      className={`pb-band${compact ? " is-compact" : ""}`}
      style={style}
      title={compact ? label : undefined}
      aria-label={label}
      role={onOpen ? "button" : "group"}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={key}
    >
      <span aria-hidden="true" className="pb-emoji">
        {emoji}
      </span>
      {compact ? null : (
        <>
          <span className="pb-name">{title}</span>
          {time ? <span className="pb-time">{time}</span> : null}
        </>
      )}
    </div>
  );
}

/** A band as a line in a list: Home's day, the phone's day. */
export function PersonalRow({
  band,
  onOpen,
}: {
  band: DayBand;
  onOpen?: (band: DayBand, event: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <PersonalBand
      variant="row"
      blockId={band.blockId}
      title={band.title}
      emoji={band.emoji}
      tone={band.tone}
      time={bandTimeLabel(band)}
      repeating={band.repeating}
      linked={band.linked}
      onOpen={onOpen ? (event) => onOpen(band, event) : undefined}
    />
  );
}

/**
 * The reusable piece for a day: every personal block of `date` as quiet rows,
 * and nothing when there is none. Home's day mounts this with its own date;
 * the hook behind it is `usePersonalDay`.
 */
export function PersonalDayBands({
  date,
  className,
  onOpen,
}: {
  date: string;
  className?: string;
  onOpen?: (band: DayBand, event: MouseEvent<HTMLElement>) => void;
}) {
  const bands = usePersonalDay(date);
  if (!bands.length) return null;
  return (
    <div
      className={`pb-day${className ? ` ${className}` : ""}`}
      data-personal-day={date}
    >
      {bands.map((band) => (
        <PersonalRow key={band.key} band={band} onOpen={onOpen} />
      ))}
    </div>
  );
}
