/**
 * Which parts of a document's style are Pro. Client-safe (no Prisma, no
 * server code): the Style panel locks the same values the pages API refuses.
 *
 * Document themes are Pro: a backdrop behind the page, which is also what
 * every "All Styles" preset but Default adds. Colour, text, cover, font,
 * separator and width stay free, so a preset's other keys need no gate.
 * The rule reads the style as it draws (`styleOf`), so a legacy `theme` or
 * `ground` that resolves to a backdrop counts the same as `backdrop` itself.
 */
import { type StyledDoc, styleOf } from "./style";

/** Style keys whose non-free values need Pro. */
export const PRO_STYLE_KEYS = ["backdrop"] as const;
export type ProStyleKey = (typeof PRO_STYLE_KEYS)[number];

/** The one value of each Pro key that a free plan may set. */
export const FREE_STYLE_VALUES: Record<ProStyleKey, string> = {
  backdrop: "none",
};

export const isProStyleValue = (key: ProStyleKey, value: unknown) =>
  value !== FREE_STYLE_VALUES[key];

type StyleField = StyledDoc["style"] | undefined;

const resolved = (style: StyleField) =>
  styleOf({
    coverUrl: null,
    style: style && typeof style === "object" ? style : null,
  });

/**
 * The Pro keys a write moves to a Pro value it did not already have. A value
 * kept as it was (a page downgraded after choosing it) and a reset to the free
 * value are not changes a free plan is refused.
 */
export function proStyleChanges(
  before: StyleField,
  after: StyleField
): ProStyleKey[] {
  const was = resolved(before);
  const next = resolved(after);
  return PRO_STYLE_KEYS.filter(
    (key) => isProStyleValue(key, next[key]) && next[key] !== was[key]
  );
}
