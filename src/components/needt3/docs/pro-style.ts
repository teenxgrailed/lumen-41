/**
 * Which parts of a document's style are Pro. Client-safe (no Prisma, no
 * server code): the Style panel locks the same values the pages API refuses.
 *
 * Free: the four fonts, three page colours (White, Paper, Graphite), text
 * colour, separator and width. Pro: a backdrop behind the page, a cover (a
 * drawn art or an uploaded picture), the other page colours, and every "All
 * Styles" preset but Default (a preset carries a backdrop and a page colour).
 * The rule reads the style as it draws (`styleOf`), so a legacy `theme` or
 * `ground` that resolves to a backdrop counts the same as `backdrop` itself.
 *
 * Only a change to a Pro value is refused. A value the page already has (kept
 * after a downgrade) and a move back to a free value are not.
 */
import { type StyledDoc, styleOf } from "./style";

/** Style keys whose non-free values need Pro. `cover` lives in `Page.coverUrl`. */
export const PRO_STYLE_KEYS = ["backdrop", "page", "cover"] as const;
export type ProStyleKey = (typeof PRO_STYLE_KEYS)[number];

/** The page colours a free plan may use. */
export const FREE_PAGE_COLOURS = ["white", "paper", "graphite"] as const;

/** The values of each Pro key that a free plan may set ("none": no cover). */
export const FREE_STYLE_VALUES: Record<ProStyleKey, readonly string[]> = {
  backdrop: ["none"],
  page: FREE_PAGE_COLOURS,
  cover: ["none"],
};

export const isProStyleValue = (key: ProStyleKey, value: unknown) =>
  !FREE_STYLE_VALUES[key].includes(
    key === "cover" ? (value ? "cover" : "none") : String(value)
  );

type StyleField = StyledDoc["style"] | undefined;
type CoverField = string | null | undefined;

const resolved = (style: StyleField, coverUrl: CoverField) =>
  styleOf({
    coverUrl: coverUrl ?? null,
    style: style && typeof style === "object" ? style : null,
  });

/**
 * The Pro keys a write moves to a Pro value it did not already have. A value
 * kept as it was (a page downgraded after choosing it) and a reset to the free
 * value are not changes a free plan is refused. `cover` is the page's
 * `coverUrl` before and after; an `after` of `undefined` means the write does
 * not touch it.
 */
export function proStyleChanges(
  before: StyleField,
  after: StyleField,
  cover?: { before?: CoverField; after?: CoverField }
): ProStyleKey[] {
  const coverBefore = cover?.before ?? null;
  const coverAfter = cover?.after === undefined ? coverBefore : cover.after;
  const was = resolved(before, coverBefore);
  const next = resolved(after, coverAfter);
  return PRO_STYLE_KEYS.filter(
    (key) => isProStyleValue(key, next[key]) && next[key] !== was[key]
  );
}
