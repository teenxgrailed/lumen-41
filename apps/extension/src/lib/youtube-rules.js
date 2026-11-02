// @ts-check
/**
 * Always-on YouTube mode: settings, block lists and matching. Pure, no DOM and
 * no chrome.* so it is tested in Node. Stored in chrome.storage.sync under
 * `yt`; it needs no token and no Needt account.
 */

export const YT_KEY = "yt";

/** Defaults for a fresh install: Shorts and the home feed off, the rest untouched. */
export const YT_DEFAULTS = Object.freeze({
  noShorts: true,
  noHome: true,
  noSidebar: false,
  noEndscreen: false,
  noComments: false,
  noAutoplay: false,
  blockChannels: /** @type {string[]} */ ([]),
  blockKeywords: /** @type {string[]} */ ([]),
});

/** The toggles, in the order the options page and the popup show them. */
export const YT_TOGGLES = /** @type {const} */ ([
  ["noShorts", "Hide Shorts everywhere"],
  ["noHome", "Hide the home feed"],
  ["noSidebar", "Hide recommendations beside the video"],
  ["noEndscreen", "Hide end cards and the end-of-video wall"],
  ["noComments", "Hide comments"],
  ["noAutoplay", "Turn autoplay off"],
]);

const FLAGS = ["noShorts", "noHome", "noSidebar", "noEndscreen", "noComments", "noAutoplay"];

/** Fills gaps with defaults and drops anything that is not the right type. */
export function normalizeYt(raw) {
  const out = { ...YT_DEFAULTS, blockChannels: [], blockKeywords: [] };
  if (!raw || typeof raw !== "object") return out;
  for (const flag of FLAGS) if (typeof raw[flag] === "boolean") out[flag] = raw[flag];
  for (const list of ["blockChannels", "blockKeywords"]) {
    if (Array.isArray(raw[list])) {
      out[list] = raw[list].filter((l) => typeof l === "string").map((l) => l.trim()).filter(Boolean);
    }
  }
  return out;
}

/**
 * One list line: `/regex/flags` is a regular expression, anything else is a
 * case-insensitive match (substring for keywords, whole name or @handle for
 * channels). A broken regex is ignored instead of throwing.
 * @returns {{ re: RegExp } | { text: string } | null}
 */
export function parseEntry(line) {
  const text = String(line ?? "").trim();
  if (!text) return null;
  const m = /^\/(.+)\/([a-z]*)$/.exec(text);
  if (m) {
    try {
      return { re: new RegExp(m[1], m[2].includes("i") ? m[2] : m[2] + "i") };
    } catch {
      return null;
    }
  }
  return { text: text.toLowerCase() };
}

/** Compiles a list once; matching then costs one pass per tile. */
export function compileList(lines) {
  return (lines ?? []).map(parseEntry).filter((e) => e !== null);
}

/** Lower-case handle ("@name") from a channel href such as "/@name" or "/@name/videos". */
export function handleFromHref(href) {
  const m = /\/(@[^/?#]+)/.exec(href ?? "");
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

/**
 * Whether a tile is on a block list.
 * @param {{ title?: string, channel?: string, handle?: string }} video
 * @param {{ channels: ReturnType<typeof compileList>, keywords: ReturnType<typeof compileList> }} lists
 */
export function isBlocked(video, lists) {
  const channel = (video.channel ?? "").trim();
  const handle = (video.handle ?? "").toLowerCase();
  const title = video.title ?? "";
  const lowerChannel = channel.toLowerCase();
  const lowerTitle = title.toLowerCase();
  for (const e of lists.channels) {
    if ("re" in e) {
      if ((channel && e.re.test(channel)) || (handle && e.re.test(handle))) return true;
    } else if ((lowerChannel && e.text === lowerChannel) || (handle && e.text === handle)) {
      return true;
    }
  }
  for (const e of lists.keywords) {
    if ("re" in e ? e.re.test(title) : lowerTitle.includes(e.text)) return true;
  }
  return false;
}

/** The entry the "block channel" button stores: the handle when known, else the name. */
export function channelEntry(channel, handle) {
  return (handle || channel || "").trim();
}

/** Adds an entry to a list once, ignoring case. Returns the same array when nothing changed. */
export function addEntry(list, entry) {
  const value = String(entry ?? "").trim();
  if (!value || list.some((l) => l.toLowerCase() === value.toLowerCase())) return list;
  return [...list, value];
}

/** "/shorts/ID" becomes "/watch?v=ID"; anything else is null. */
export function shortsRedirect(pathname) {
  const m = /^\/shorts\/([\w-]+)/.exec(pathname ?? "");
  return m ? `/watch?v=${m[1]}` : null;
}

/**
 * Classes for <html>; youtube.css does the hiding. The home feed class only
 * applies on the home page itself, so search and watch stay untouched.
 */
export function rootClasses(yt, pathname) {
  const out = [];
  if (yt.noShorts) out.push("needt-yt-noshorts");
  if (yt.noHome && (pathname === "/" || pathname === "")) out.push("needt-yt-nohome");
  if (yt.noSidebar) out.push("needt-yt-nosidebar");
  if (yt.noEndscreen) out.push("needt-yt-noendscreen");
  if (yt.noComments) out.push("needt-yt-nocomments");
  return out;
}
