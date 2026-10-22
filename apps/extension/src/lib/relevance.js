// @ts-check
/**
 * Goal filter for feeds: how close a video title is to what the person is
 * focused on (the task or event title of the active focus block). Lexical, on
 * the device, no model: shared word stems, with stop words dropped. Pure.
 */

const STOP = new Set(
  (
    "a an the and or of to in on for with how what why is are be my your i you " +
    "this that it by at from as vs video new best top full part ep episode " +
    "и в во на с со к по для как что это у о об от из за до не я мы вы"
  ).split(" ")
);

/** Lower-case word stems (first 5 letters) of a text. */
export function stems(text) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}+#]+/u)
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map((w) => w.slice(0, 5))
  );
}

/** Share of the goal's stems that the title also has, 0..1. */
export function relevance(goal, title) {
  const g = stems(goal);
  if (g.size === 0) return 1;
  const t = stems(title);
  let hit = 0;
  for (const s of g) if (t.has(s)) hit++;
  return hit / g.size;
}

/**
 * Whether a video stays visible during a focus block.
 * @param {{ goal: string, title: string, channel?: string,
 *   allowChannels?: string[], blockChannels?: string[], threshold?: number }} input
 */
export function keepVideo(input) {
  const channel = (input.channel ?? "").toLowerCase();
  if (channel && input.blockChannels?.some((c) => c.toLowerCase() === channel))
    return false;
  if (channel && input.allowChannels?.some((c) => c.toLowerCase() === channel))
    return true;
  return relevance(input.goal, input.title) >= (input.threshold ?? 0.34);
}

/** Snooze budget: minutes left today out of `dailyMinutes`. */
export function snoozeLeft(used, dailyMinutes = 15) {
  return Math.max(0, dailyMinutes - Math.max(0, used));
}
