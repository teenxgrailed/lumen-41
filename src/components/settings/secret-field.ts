/**
 * Rules for a stored-secret field in admin settings. The API never returns a
 * stored secret; it returns SECRET_MASK in its place (see
 * `@/lib/api/public-records`) and ignores any value that still contains the
 * mask, so the form must only ever send a value the person typed in full.
 */

const MASK_CHAR = "•";

/**
 * What to save when the person leaves the field: the draft when it is a new
 * value, or null when nothing should be sent (unchanged, or still carrying
 * the mask, which the server would drop anyway). An empty draft is a
 * deliberate clear and is sent.
 */
export function secretToCommit(stored: string, draft: string): string | null {
  if (draft === stored) return null;
  if (draft.includes(MASK_CHAR)) return null;
  return draft;
}
