/**
 * ⌘K matching (prototype search.jsx): whole query > every word > letters in
 * order. Returns a score and the character indices to set bold, or null.
 */
export interface Match {
  score: number;
  idx: number[];
}

const range = (a: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + i);
const WORD_START = /[\s\-—_/(]/;
const WORD_GAP = /[\s\-—_/]/;

export function match(
  text: string | null | undefined,
  q: string
): Match | null {
  const lt = String(text ?? "").toLowerCase();
  const lq = q.toLowerCase().trim();
  if (!lq) return null;
  const at = lt.indexOf(lq);
  if (at > -1) {
    const wordStart = at === 0 || WORD_START.test(lt[at - 1]);
    return {
      score: 100 - Math.min(at, 40) + (at === 0 ? 30 : wordStart ? 15 : 0),
      idx: range(at, lq.length),
    };
  }
  const words = lq.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    let idx: number[] = [];
    let ok = true;
    for (const w of words) {
      const i = lt.indexOf(w);
      if (i < 0) ok = false;
      else idx = idx.concat(range(i, w.length));
    }
    if (ok) return { score: 50, idx };
  }
  if (lq.length < 3) return null;
  /* Letters in order, each starting a word or following the last hit
     closely, so "cal" never matches a stray c…a…l across a sentence. */
  const idx: number[] = [];
  let from = 0;
  for (const ch of lq) {
    if (ch === " ") continue;
    let i = lt.indexOf(ch, from);
    while (
      i > -1 &&
      idx.length &&
      i - idx[idx.length - 1] > 1 &&
      !(i === 0 || WORD_GAP.test(lt[i - 1]))
    )
      i = lt.indexOf(ch, i + 1);
    if (i < 0) return null;
    idx.push(i);
    from = i + 1;
  }
  return { score: 20 - Math.min(idx[idx.length - 1] - idx[0], 19), idx };
}

/** Rank `items` by `get(item)` against `q`, best first, at most `max`. */
export function rank<T>(
  items: readonly T[],
  get: (item: T) => string,
  q: string,
  max = 6
): { item: T; m: Match }[] {
  return items
    .map((item) => {
      const m = match(get(item), q);
      return m ? { item, m } : null;
    })
    .filter((x): x is { item: T; m: Match } => !!x)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, max);
}

/** Split `text` into runs, bold where `idx` hits. */
export function highlightRuns(
  text: string,
  idx: readonly number[] | undefined
) {
  const set = new Set(idx ?? []);
  const out: { text: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const on = set.has(i);
    const lastRun = out[out.length - 1];
    if (lastRun && lastRun.on === on) lastRun.text += text[i];
    else out.push({ text: text[i], on });
  }
  return out;
}
