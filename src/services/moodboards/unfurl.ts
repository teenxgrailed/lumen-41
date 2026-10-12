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

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h: string) =>
      safeCodePoint(parseInt(h, 16), m)
    )
    .replace(/&#(\d{1,7});/g, (m, d: string) => safeCodePoint(Number(d), m))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
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

/** The `<meta>` tags of the head as name/property → content (first one wins). */
function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(
      /([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
    )) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
    }
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content !== undefined && !out.has(key)) {
      out.set(key, decode(attrs.content));
    }
  }
  return out;
}

const clip = (value: string | null | undefined, max: number) => {
  const v = (value ?? "").trim();
  return v ? v.slice(0, max) : null;
};

/** Pure: the preview inside `html`, with relative addresses resolved on `base`. */
export function parseLinkPreview(html: string, base: string): LinkPreview {
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || undefined);
  const meta = metaTags(head);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title =
    clip(meta.get("og:title"), 240) ??
    clip(meta.get("twitter:title"), 240) ??
    clip(titleTag ? decode(titleTag) : null, 240);
  const siteName = clip(meta.get("og:site_name"), 120);
  let thumbnailUrl: string | null = null;
  const image =
    meta.get("og:image:secure_url") ??
    meta.get("og:image") ??
    meta.get("twitter:image") ??
    meta.get("twitter:image:src");
  if (image) {
    try {
      const url = new URL(image, base);
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
