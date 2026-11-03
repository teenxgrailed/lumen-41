/**
 * "No confirmation": an item that declared no risks (`risks: []`) but whose
 * done-criteria or result talk about doing something that normally needs the
 * owner's say: sending, publishing, posting, deleting or paying. The hub only
 * gates the risks a creator declares, so such work can run unasked; the tag
 * lets the owner spot it. It is a hint, not a verdict.
 *
 * The match is a plain, case-insensitive whole-word keyword test on the
 * stems send/sent, publish, post, delete and pay (with their usual endings:
 * sending, published, posts, deleted, payment, paid). "postpone" or "display"
 * do not match. No language model, no scoring: if the words are there, the
 * tag shows. See docs/agents/hub-protocol.md.
 */
const RISKY_WORDS =
  /\b(?:send|sends|sending|sent|publish|publishes|publishing|published|post|posts|posting|posted|delete|deletes|deleting|deleted|pay|pays|paying|payment|payments|paid)\b/i;

export interface RiskText {
  risks: readonly string[];
  doneCriteria?: string | null;
  criteria?: readonly { text: string }[];
  result?: { summary?: string } | null;
}

export function mentionsRiskyWork(text: string): boolean {
  return RISKY_WORDS.test(text);
}

export function hasUnconfirmedRisk(item: RiskText): boolean {
  if (item.risks.length > 0) return false;
  const text = [
    item.doneCriteria ?? "",
    ...(item.criteria ?? []).map((entry) => entry.text),
    item.result?.summary ?? "",
  ].join("\n");
  return mentionsRiskyWork(text);
}
