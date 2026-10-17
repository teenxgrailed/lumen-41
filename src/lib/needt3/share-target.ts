/**
 * What the OS share sheet hands to Needt (Web Share Target, manifest
 * `share_target`): the title, the text, the link and files. Pure: the route
 * handler, the service worker's twin of `shareQuery` and the Share page all
 * read the same rules. Android only: iOS PWAs cannot be share targets.
 */

export const SHARE_PAGE = "/share";
export const SHARE_ACTION = "/api/share-target";
/** Where the service worker keeps the shared files until the page saves them. */
export const SHARE_CACHE = "needt-private-v5:share";
const FIELD_MAX = 2000;
const FILES_MAX = 10;

export interface SharedPayload {
  title: string;
  text: string;
  url: string;
  /** The service worker's key for the shared files, when it kept any. */
  stash: string | null;
  /** How many files the stash holds. */
  files: number;
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"']+/i;

const clean = (v: unknown) =>
  typeof v === "string" ? v.trim().slice(0, FIELD_MAX) : "";

/**
 * The fields of a share. Android apps often put the link inside `text`
 * and leave `url` empty; then the link is lifted out of the text.
 */
export function readShare(
  get: (key: string) => string | null | undefined
): SharedPayload {
  const title = clean(get("title"));
  let text = clean(get("text"));
  let url = clean(get("url"));
  if (!/^https?:\/\//i.test(url)) url = "";
  if (!url) {
    const found = URL_IN_TEXT.exec(text);
    if (found) {
      url = found[0];
      text = text
        .replace(found[0], "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  }
  const stash = clean(get("stash"));
  const files = Math.max(
    0,
    Math.min(FILES_MAX, Number.parseInt(get("files") ?? "0", 10) || 0)
  );
  return {
    title,
    text,
    url,
    stash: /^[0-9a-f-]{8,64}$/i.test(stash) ? stash : null,
    files,
  };
}

/** The Share page's query for a payload (no files: only the service worker has them). */
export function shareQuery(p: Pick<SharedPayload, "title" | "text" | "url">) {
  const q = new URLSearchParams();
  if (p.title) q.set("title", p.title);
  if (p.text) q.set("text", p.text);
  if (p.url) q.set("url", p.url);
  return q.toString();
}

/** A name for what was shared: the title, else the first line, else the site. */
export function sharedTitle(p: SharedPayload): string {
  const first =
    p.text
      .split(/\r?\n/)
      .find((l) => l.trim())
      ?.trim() ?? "";
  let host = "";
  try {
    host = p.url ? new URL(p.url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  const named = p.title || first || host || "Shared to Needt";
  return named.length > 120 ? `${named.slice(0, 117)}...` : named;
}

/** The body kept with a task or document: the text, then the link. */
export function sharedBody(p: SharedPayload): string {
  return [p.text, p.url].filter(Boolean).join("\n\n");
}

export type ShareKind = "task" | "doc" | "board";

/** True when the share holds something to save. */
export function hasShare(p: SharedPayload): boolean {
  return !!(p.title || p.text || p.url || p.files);
}

/**
 * Which kinds can hold this share. A task keeps text and a link (not files); a
 * document keeps all of it; a board keeps a link, a note or pictures.
 */
export function kindsFor(
  p: SharedPayload,
  fileTypes: readonly string[] = []
): ShareKind[] {
  const text = !!(p.title || p.text || p.url);
  const kinds: ShareKind[] = [];
  if (text) kinds.push("task");
  kinds.push("doc");
  if (p.url || p.text || fileTypes.some((t) => t.startsWith("image/")))
    kinds.push("board");
  return kinds;
}

/** The first kind the sheet offers: a link goes to a board only if the person picks it. */
export function defaultKind(
  p: SharedPayload,
  kinds: readonly ShareKind[]
): ShareKind {
  if (kinds.includes("task") && !p.files) return "task";
  return kinds.includes("doc") ? "doc" : kinds[0];
}
