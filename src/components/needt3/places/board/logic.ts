/**
 * The board page's rules, pure (places.jsx `MoodboardsScreen`: `linkFromUrl`,
 * `mbDownscale`, `onPaste`, the Share sheet's checks, the tile's labels).
 * Nothing here touches the DOM or the network, so every rule has a test.
 */
import type { BoardGrant, BoardPerson } from "@/lib/needt3/hooks/board-share";
import type { BoardItemDraft, V3BoardItem } from "@/lib/needt3/hooks/boards";
import type { BoardRole } from "@/lib/needt3/map";

/* ---------- links ---------- */

const NAMED: Record<string, string> = {
  "figma.com": "Figma",
  "pinterest.com": "Pinterest",
  "are.na": "Are.na",
  "youtube.com": "YouTube",
  "instagram.com": "Instagram",
  "behance.net": "Behance",
  "dribbble.com": "Dribbble",
  "vimeo.com": "Vimeo",
  "grailed.com": "Grailed",
  "ssense.com": "SSENSE",
};

/** A typed or pasted address as a URL (https assumed), or null when it is not one. */
export function normUrl(raw: string): URL | null {
  let s = String(raw || "").trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(s)) return null;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    return /\./.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

const SKIP_SEGMENT =
  /^(design|file|proto|board|block|p|pin|watch|r|post|posts|item|items|product|products|en|de)$/i;

export interface LinkParts {
  url: string;
  title: string;
  name: string;
  domain: string;
  ratio: number;
}

/**
 * A link's preview built from the address alone (no network): the site's name
 * and a title from the last readable path segment. The server replaces it
 * with the page's own title and picture when it can read them.
 */
export function linkFromUrl(raw: string): LinkParts | null {
  const u = normUrl(raw);
  if (!u) return null;
  const domain = u.hostname.replace(/^www\./, "");
  const root = domain.split(".").slice(-2).join(".");
  const first = root.split(".")[0];
  const name = NAMED[root] || first.charAt(0).toUpperCase() + first.slice(1);
  const segs = u.pathname
    .split("/")
    .filter(Boolean)
    .map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    })
    .filter(
      (x) =>
        !(
          /^\d+$/.test(x) ||
          (/^[A-Za-z0-9_]{4,}$/.test(x) && /\d/.test(x) && /[A-Za-z]/.test(x))
        )
    )
    .filter((x) => !SKIP_SEGMENT.test(x));
  let title = segs.length
    ? segs[segs.length - 1]
        .replace(/\.[a-z0-9]{2,4}$/i, "")
        .replace(/[-_+]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  if (!title && u.searchParams.get("v")) title = "Video";
  title = title ? title.charAt(0).toUpperCase() + title.slice(1) : name;
  return {
    url: u.href,
    title,
    name,
    domain,
    ratio: root === "figma.com" ? 0.66 : 0.72,
  };
}

export const linkDraft = (p: LinkParts): BoardItemDraft => ({
  kind: "link",
  url: p.url,
  title: p.title,
  source: { name: p.name, domain: p.domain },
  ratio: p.ratio,
});

export const isFigma = (it: Pick<V3BoardItem, "source"> | null | undefined) =>
  !!it?.source?.domain && /(^|\.)figma\.com$/.test(it.source.domain);

/** Only an http(s) address is ever opened in a new tab. */
export const isWebUrl = (url: string | null | undefined): url is string =>
  !!url && /^https?:\/\//i.test(url);

/* ---------- colours ---------- */

/** "c2410c", "#C2410C" or "#c41" as "#c2410c" / "#cc4411"; null if it is not a hex colour. */
export function normHex(raw: string): string | null {
  const t = String(raw || "").trim();
  if (/^#?[0-9a-f]{6}$/i.test(t))
    return `#${t.replace(/^#/, "")}`.toLowerCase();
  if (/^#?[0-9a-f]{3}$/i.test(t)) {
    const [r, g, b] = t.replace(/^#/, "");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

export const SIX_HEX = (raw: string) =>
  /^#?[0-9a-f]{6}$/i.test(String(raw || "").trim());

/** The prototype's eight presets for the Colour dialog. */
export const COLOUR_PRESETS: readonly (readonly [string, string])[] = [
  ["#1c1c1c", "Ink"],
  ["#e9e4da", "Paper"],
  ["#8a8178", "Concrete"],
  ["#3b3f2e", "Olive"],
  ["#b03a2e", "Brick"],
  ["#26303a", "Night blue"],
  ["#cbbba0", "Sand"],
  ["#9aa39b", "Sage"],
];

/** WCAG relative luminance, to pick a readable label ink for a swatch. */
export function luminance(hex: string): number {
  const h = normHex(hex);
  if (!h) return 1;
  const n = parseInt(h.slice(1), 16);
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/** A stable hue (0–359) for a domain or an email, for badges and avatars. */
/** The site a reference points at, without `www.` (the prototype's `source.domain`). */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return /\./.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function hueOf(s: string | null | undefined): number {
  let h = 0;
  const str = s || "";
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

/* ---------- pictures ---------- */

/** The longest side a picture is shrunk to before it is uploaded. */
export const IMAGE_MAX_SIDE = 900;
export const JPEG_QUALITY = 0.8;
/** The second try for a picture that is still over the server's size limit. */
export const JPEG_QUALITY_LIGHT = 0.6;
/** The server's limit for one picture (MOODBOARD_IMAGE_MAX_BYTES: 1.5 MB). */
export const UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024;

/** The size to draw a w × h picture at so its longest side is at most `max` (never enlarged). */
export function fitWithin(w: number, h: number, max = IMAGE_MAX_SIDE) {
  const longest = Math.max(w || 1, h || 1);
  const k = Math.min(1, max / longest);
  return {
    width: Math.max(1, Math.round((w || 1) * k)),
    height: Math.max(1, Math.round((h || 1) * k)),
  };
}

/** height / width as the grid stores it, three places. */
export const ratioOf = (w: number, h: number) =>
  w > 0 ? +(h / w).toFixed(3) : 1;

/** The name a picture gets as a title: the file's name without its extension. */
export const titleFromFile = (name: string | undefined, fallback = "Image") =>
  (name || fallback).replace(/\.[a-z0-9]+$/i, "") || fallback;

export const isImageFile = (f: { type?: string }) =>
  /^image\//.test(f.type || "");

/* ---------- paste (⌘V on the board) ---------- */

export type PasteAction =
  | { kind: "images"; files: File[] }
  | { kind: "colour"; hex: string }
  | { kind: "link"; link: LinkParts }
  | { kind: "none" };

/** What a paste means: pictures first, then a hex colour, then the first thing that is a link. */
export function classifyPaste(input: {
  files: readonly File[];
  text: string;
}): PasteAction {
  const files = input.files.filter(isImageFile);
  if (files.length) return { kind: "images", files };
  const text = input.text.trim();
  if (!text) return { kind: "none" };
  if (/^#?[0-9a-f]{6}$/i.test(text))
    return { kind: "colour", hex: normHex(text) as string };
  const link = linkFromUrl(text.split(/\s+/)[0]);
  return link ? { kind: "link", link } : { kind: "none" };
}

/** Is the paste aimed at a field (typing there is not a board paste)? */
export function isFieldTarget(el: unknown): boolean {
  const t = el as { tagName?: string; isContentEditable?: boolean } | null;
  return (
    !!t &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || !!t.isContentEditable)
  );
}

/* ---------- labels ---------- */

export const sourceLabel = (it: V3BoardItem): string =>
  it.kind === "link"
    ? (it.source?.domain ?? "")
    : it.kind === "image"
      ? (it.source?.domain ?? "Uploaded")
      : it.kind === "color"
        ? it.colorName || (it.color ?? "").toUpperCase()
        : "Note";

export const referencesLabel = (n: number) =>
  `${n} ${n === 1 ? "reference" : "references"}`;

export const initials = (name: string | null | undefined) =>
  (name || "?")
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const personName = (p: { name: string | null; email: string | null }) =>
  p.name || (p.email ? p.email.split("@")[0] : "Someone");

/* ---------- roles ---------- */

export const ROLE_LABEL: Record<BoardRole, string> = {
  VIEWER: "Can view",
  EDITOR: "Can edit",
  FULL_ACCESS: "Full access",
};

/** The two roles an invite offers; Full access is the owner's. */
export const INVITE_ROLES: readonly [BoardRole, string][] = [
  ["VIEWER", "View"],
  ["EDITOR", "Edit"],
];

export const canWrite = (role: BoardRole | null | undefined) =>
  role === "EDITOR" || role === "FULL_ACCESS";

export const canManage = (role: BoardRole | null | undefined) =>
  role === "FULL_ACCESS";

export const isEmail = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export type InviteCheck =
  | { ok: true; person: BoardPerson }
  | { ok: false; reason: "empty" | "invalid" | "owner" | "dupe" | "outside" };

/** What a typed email resolves to: a workspace member who can be given a role, or why not. */
export function checkInvite(
  raw: string,
  candidates: readonly BoardPerson[],
  grants: readonly BoardGrant[],
  ownerId: string | null
): InviteCheck {
  const e = raw.trim().toLowerCase();
  if (!e) return { ok: false, reason: "empty" };
  if (!isEmail(e)) return { ok: false, reason: "invalid" };
  const m = candidates.find((p) => (p.email ?? "").toLowerCase() === e);
  if (!m) return { ok: false, reason: "outside" };
  if (m.userId === ownerId) return { ok: false, reason: "owner" };
  if (grants.some((g) => g.userId === m.userId))
    return { ok: false, reason: "dupe" };
  return { ok: true, person: m };
}

/** The line under the Share sheet's title. */
export function shareSubline(people: number, linkShare: boolean) {
  if (!people && !linkShare) return "Private — only you can see this board";
  if (!people) return "Anyone with the link can view";
  const n = people === 1 ? "1 person" : `${people} people`;
  return `Shared with ${n}${linkShare ? " and anyone with the link" : ""}`;
}

/** A board with nobody else on it and no link is private (a lock on its card). */
export const isPrivateBoard = (b: {
  memberCount?: number | null;
  linkShare: boolean;
}) => !(b.memberCount ?? 0) && !b.linkShare;

/** The address "Anyone with the link" opens; null until the server has sent the token. */
export function publicBoardUrl(
  origin: string,
  boardId: string,
  token: string | null | undefined
) {
  return token
    ? `${origin}/b/${encodeURIComponent(boardId)}/${encodeURIComponent(token)}`
    : null;
}

/* ---------- Pinterest ---------- */

/** "Imported 12 Pins from Moodboard" and what was left out, in one line. */
export function pinterestResultLine(
  r: { imported: number; skipped: number; failed: number; full: boolean },
  boardName: string
): string {
  const head = r.imported
    ? `Imported ${r.imported} ${r.imported === 1 ? "Pin" : "Pins"} from ${boardName}`
    : `Nothing new in ${boardName}`;
  const tail = [
    r.failed ? `${r.failed} could not be copied` : "",
    r.full ? "the board is full" : "",
  ].filter(Boolean);
  return tail.length ? `${head} · ${tail.join(", ")}` : head;
}

/**
 * The address that opens the reference's source: its own web address, else the
 * page it came from (a picture imported from a Pinterest Pin keeps the Pin).
 */
export const sourceUrlOf = (
  it: Pick<V3BoardItem, "url" | "source">
): string | null =>
  isWebUrl(it.url) ? it.url : isWebUrl(it.source?.url) ? it.source.url : null;
