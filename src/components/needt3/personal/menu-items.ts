import { PERSONAL_PRESETS, type PersonalPreset } from "@/lib/personal-time";

import type { RichMenuItem } from "../menu/RichMenu";

/** "15 min", "1 h", "1 h 30 min". */
export function lengthLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * The one-tap presets as rows for a RichMenu (the Create menu, the
 * calendar's New menu): a rule, then Lunch, Break, Walk and the rest, each
 * with its emoji and its usual length.
 */
export function personalMenuItems(
  pick: (preset: PersonalPreset) => void
): RichMenuItem[] {
  return [
    { sep: true },
    ...PERSONAL_PRESETS.map(
      (preset): RichMenuItem => ({
        glyph: preset.emoji,
        compact: true,
        title: preset.title,
        kbd: lengthLabel(preset.minutes),
        onClick: () => pick(preset),
      })
    ),
  ];
}
