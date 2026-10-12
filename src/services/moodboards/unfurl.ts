import {
  type Downloaded,
  type ResolveHost,
  type Transport,
  safeDownload,
} from "@/services/imports/safe-fetch";

/**
 * A link's preview, read server-side from the page's own tags (Open Graph,
 * Twitter card, `<title>`). Only the title, the site name and the picture's
 * ADDRESS are kept: the picture is not downloaded or copied (it is hotlinked
 * by the board), and a page that fails any of the safe download's rules, is not HTML,
 * or has no tags simply yields `null` and the link is saved without a preview.
 */
export interface LinkPreview {
  title: string | null;
  siteName: string | null;
  /** https address of the page's picture, or null. */
  thumbnailUrl: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Tags live in the head; nothing past this many characters is looked at. */
export const SCAN_LIMIT = 64 * 1024;
/** One tag or one title longer than this is skipped, not parsed. */
const TAG_LIMIT = 4096;

/** Controls (NUL included, which Postgres refuses in text) become spaces. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

function decode(value: string): string {
  return value
    .slice(0, TAG_LIMIT)
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h: string) =>
      safeCodePoint(parseInt(h, 16), m)
    )
    .replace(/&#(\d{1,7});/g, (m, d: string) => safeCodePoint(Number(d), m))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(CONTROLS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeCodePoint(code: number, fallback: string) {
  try {
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
  } catch {
    return fallback;
  }
}

const isSpace = (c: string) =>
  c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";

/**
 * The attributes of one tag, read with a single left-to-right pass (no regex
 * on the page's text: a hostile page cannot make this superlinear).
 */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 5; // after "<meta"
  const n = tag.length;
  while (i < n) {
    while (i < n && (isSpace(tag[i]) || tag[i] === "/" || tag[i] === ">")) i++;
    const start = i;
    while (
      i < n &&
      !isSpace(tag[i]) &&
      tag[i] !== "=" &&
      tag[i] !== ">" &&
      tag[i] !== "/"
    )
      i++;
    const name = tag.slice(start, i).toLowerCase();
    while (i < n && isSpace(tag[i])) i++;
    let value = "";
    if (tag[i] === "=") {
      i++;
      while (i < n && isSpace(tag[i])) i++;
      const q = tag[i];
      if (q === '"' || q === "'") {
        const end = tag.indexOf(q, i + 1);
        value = tag.slice(i + 1, end < 0 ? n : end);
        i = end < 0 ? n : end + 1;
      } else {
        const from = i;
        while (i < n && !isSpace(tag[i]) && tag[i] !== ">") i++;
        value = tag.slice(from, i);
      }
    }
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

/** The `<meta>` tags of the head as name/property → content (first one wins). */
function metaTags(head: string, lower: string): Map<string, string> {
  const out = new Map<string, string>();
  let at = 0;
  while (at < head.length) {
    const open = lower.indexOf("<meta", at);
    if (open < 0) break;
    const close = head.indexOf(">", open);
    if (close < 0) break;
    at = close + 1;
    // "<metadata>" is not a meta tag; an enormous tag is skipped unread.
    const after = lower[open + 5];
    if (!(isSpace(after) || after === "/" || after === ">")) continue;
    if (close - open > TAG_LIMIT) continue;
    const attrs = attributes(head.slice(open, close + 1));
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content !== undefined && !out.has(key)) {
      out.set(key, decode(attrs.content));
    }
  }
  return out;
}

/** The text of the first `<title>`, or "". */
function titleText(head: string, lower: string): string {
  const open = lower.indexOf("<title");
  if (open < 0) return "";
  const gt = head.indexOf(">", open);
  if (gt < 0) return "";
  const end = lower.indexOf("</title", gt);
  if (end < 0 || end - gt > TAG_LIMIT) return "";
  return decode(head.slice(gt + 1, end));
}

const clip = (value: string | null | undefined, max: number) => {
  const v = (value ?? "").replace(CONTROLS, " ").trim();
  return v ? v.slice(0, max) : null;
};

/** Pure: the preview inside `html`, with relative addresses resolved on `base`. */
export function parseLinkPreview(html: string, base: string): LinkPreview {
  let head = html.slice(0, SCAN_LIMIT);
  let lower = head.toLowerCase();
  const end = lower.indexOf("</head");
  if (end >= 0) {
    head = head.slice(0, end);
    lower = lower.slice(0, end);
  }
  const meta = metaTags(head, lower);
  const title =
    clip(meta.get("og:title"), 240) ??
    clip(meta.get("twitter:title"), 240) ??
    clip(titleText(head, lower), 240);
  const siteName = clip(meta.get("og:site_name"), 120);
  let thumbnailUrl: string | null = null;
  const image =
    meta.get("og:image:secure_url") ??
    meta.get("og:image") ??
    meta.get("twitter:image") ??
    meta.get("twitter:image:src");
  if (image) {
    try {
      const url = new URL(image.slice(0, 2048), base);
      // https only: an http picture would be mixed content on the board.
      if (url.protocol === "https:" && url.href.length <= 2048) {
        thumbnailUrl = url.href;
      }
    } catch {
      /* not an address */
    }
  }
  return { title, siteName, thumbnailUrl };
}

/** A page's tags sit in its head; this is more than any head and less than any attack. */
export const UNFURL_MAX_BYTES = 1024 * 1024;
export const UNFURL_TIMEOUT_MS = 4000;

/**
 * Fetching goes through the importers' SSRF-safe download
 * (`services/imports/safe-fetch`): https only on the default port, no
 * credentials, every redirect hop checked, a connection that would reach a
 * private, loopback or link-local address refused at connect time, a size
 * cap and a deadline.
 */
export async function unfurlLink(
  url: string,
  deps: {
    transport?: Transport;
    resolve?: ResolveHost;
    timeoutMs?: number;
    maxBytes?: number;
  } = {}
): Promise<LinkPreview | null> {
  let res: Downloaded;
  try {
    res = await safeDownload(url, {
      maxBytes: deps.maxBytes ?? UNFURL_MAX_BYTES,
      timeoutMs: deps.timeoutMs ?? UNFURL_TIMEOUT_MS,
      transport: deps.transport,
      resolve: deps.resolve,
    });
  } catch {
    // A blocked, slow, failing or oversize page: the link is saved as typed.
    return null;
  }
  if (!/^(text\/html|application\/xhtml\+xml)/i.test(res.contentType ?? "")) {
    return null;
  }
  const preview = parseLinkPreview(res.bytes.toString("utf8"), res.finalUrl);
  return preview.title || preview.thumbnailUrl || preview.siteName
    ? preview
    : null;
}
