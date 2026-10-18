"use client";

import { LuCloudSun } from "react-icons/lu";

/** One tiny line: the weather and the day's first event. Draws nothing without text. */
export function DayLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="dl-line" data-dl-line="">
      <LuCloudSun size={13} aria-hidden />
      <span>{text}</span>
    </p>
  );
}
