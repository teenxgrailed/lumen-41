/**
 * The phone Moodboards rules, pure (phone-habits.jsx PhbBoards, PhbBoardCard,
 * PhbWall; Mobile.jsx Mbm* helpers). A board is a grid of references, not a
 * canvas (data map §7). What the API serves today is the board row; the
 * references themselves (`MoodboardItem`) have no route, so the wall's input
 * type is declared here and nothing fills it yet.
 */
import { formatInTimeZone } from "@/lib/date-utils";
import type {
  BoardItemDraft,
  BoardItemPatch,
  V3BoardItem,
} from "@/lib/needt3/hooks/boards";
import { proLimitFull, proLimitText } from "@/lib/needt3/paywall";

import { FREE_BOARDS, boardGate } from "../../places/derive";

export { FREE_BOARDS };

/** A reference on a board (prisma `MoodboardItem`, prototype `BoardItem`). */
export type PhoneBoardItem = V3BoardItem;

export const KIND_LABEL: Record<PhoneBoardItem["kind"], string> = {
  image: "Photo",
  link: "Link",
  color: "Colour",
  note: "Note",
};

/** What a reference is called: its title, colour name, first words, or its kind. */
export function itemName(it: PhoneBoardItem) {
  return (
    it.title ||
    it.colorName ||
    String(it.text || "").slice(0, 40) ||
    KIND_LABEL[it.kind]
  );
}

/**
 * The wall: two columns, each reference into the shorter one (phbColumns).
 * The heights are estimates from the ratio, so no layout is read.
 */
export function wallColumns<T extends PhoneBoardItem>(items: readonly T[]) {
  const cols: [T[], T[]] = [[], []];
  const h = [0, 0];
  for (const it of items) {
    const est =
      it.kind === "note"
        ? 0.35 + Math.min(1, (it.text || "").length / 150)
        : it.kind === "link"
          ? (it.thumbnailUrl ? it.ratio || 1 : Math.min(it.ratio || 1, 0.8)) +
            0.42
          : (it.ratio || 1) + (it.title && it.kind === "image" ? 0.14 : 0);
    const c = h[0] <= h[1] ? 0 : 1;
    cols[c].push(it);
    h[c] += est + 0.06;
  }
  return cols;
}

/** "9 Oct" the board was made, on the person's clock; "" when unknown. */
export function madeLine(createdAt: string | null, tz: string) {
  if (!createdAt) return "";
  try {
    return `Made ${formatInTimeZone(createdAt, tz, "d MMM")}`;
  } catch {
    return "";
  }
}

/** The card's one quiet line: Pinterest boards say so, the rest say when. */
export function boardMeta(
  b: { createdAt: string | null; pinterestBoardId: string | null },
  tz: string
) {
  if (b.pinterestBoardId) return "Pinterest board";
  return madeLine(b.createdAt, tz) || "Moodboard";
}

export interface BoardQuota {
  max: number | null;
  used: number;
  /** "1 of 1 boards"; null off Free. */
  text: string | null;
  atLimit: boolean;
  full: boolean;
}

/**
 * The Free board allowance from the desktop's rule (`boardGate`,
 * `FREE_BOARDS`) in the prototype's ProLimit words. An unknown plan gates
 * nothing, as on the desktop.
 */
export function boardQuota(
  planKind: string | null | undefined,
  count: number
): BoardQuota {
  const gate = boardGate(planKind, count);
  if (gate.max === null)
    return { max: null, used: count, text: null, atLimit: false, full: false };
  const facts = { used: gate.used, max: gate.max, noun: "boards" };
  return {
    max: gate.max,
    used: gate.used,
    text: proLimitText(facts),
    atLimit: gate.atLimit,
    full: proLimitFull(facts),
  };
}

/** The line the paywall names when a new board is blocked ("Unlock … with Pro"). */
export const BOARDS_PAYWALL_FEATURE = `more than ${FREE_BOARDS} ${
  FREE_BOARDS === 1 ? "moodboard" : "moodboards"
}`;

export const UNTITLED_BOARD = "Untitled board";

/** The sheet that names a board (PhbNameSheet): new, or rename. */
export interface NameAsk {
  mode: "new" | "rename";
  /** The board being renamed; null for a new one. */
  id: string | null;
  value: string;
  /** The title a rename started from, to skip a save that changes nothing. */
  was: string;
}

export function nameOk(value: string) {
  return !!value.trim();
}

/** A rename to the same words (or to nothing) writes nothing. */
export function renameChanges(ask: Pick<NameAsk, "value" | "was">) {
  const v = ask.value.trim();
  return !!v && v !== ask.was;
}

export function searchBoards<B extends { title: string }>(
  list: readonly B[],
  q: string
) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return list
    .filter((b) => (b.title || "").toLowerCase().includes(s))
    .slice(0, 6);
}

export function boardCountLine(n: number) {
  return `${n} ${n === 1 ? "board" : "boards"}`;
}

/* ── Adding a reference (PhbAddSheet): a link, a colour, a note ── */

/** Photo needs an upload route and Pinterest a connection; neither is here. */
export type AddKind = "link" | "color" | "note";

/** The prototype's swatches (MBM_SWATCHES + the wave-3 rows), name by hex. */
export const SWATCHES: readonly (readonly [string, string])[] = [
  ["#16161A", "Ink"],
  ["#F2EDE3", "Paper"],
  ["#B9AE97", "Bone"],
  ["#D7263D", "Signal red"],
  ["#3E4A3D", "Moss"],
  ["#4C8DFF", "Cobalt"],
  ["#FFC53D", "Sodium"],
  ["#8F3A2E", "Rust"],
  ["#C9D3DC", "Chrome"],
  ["#2FD08A", "Mint"],
  ["#B072FF", "Violet"],
  ["#E9E4DA", "Limewash"],
  ["#FF8A3D", "Orange"],
  ["#2E6B5E", "Teal"],
  ["#5B4B8A", "Indigo"],
  ["#E8B4B8", "Blush"],
  ["#6B5B4B", "Walnut"],
  ["#7A8B99", "Slate"],
];

export interface AddAsk {
  step: "pick" | AddKind;
  boardId: string;
  link: string;
  swatch: number;
  hex: string;
  note: string;
}

export const blankAdd = (boardId: string): AddAsk => ({
  step: "pick",
  boardId,
  link: "",
  swatch: 3,
  hex: "",
  note: "",
});

/** A typed hex ("c2410c" or "#C2410C") as "#C2410C", else null. */
export function typedHex(raw: string) {
  const t = raw.trim();
  return /^#?[0-9a-f]{6}$/i.test(t)
    ? `#${t.replace(/^#/, "").toUpperCase()}`
    : null;
}

/** The colour the colour step is showing: a valid typed hex wins over the swatch. */
export function pickedColour(a: Pick<AddAsk, "swatch" | "hex">) {
  const typed = typedHex(a.hex);
  const sw = SWATCHES[a.swatch] ?? SWATCHES[0];
  return typed
    ? { color: typed, name: "Custom", typed: true }
    : { color: sw[0], name: sw[1], typed: false };
}

const KNOWN_SITES: Record<string, string> = {
  "are.na": "Are.na",
  "ssense.com": "SSENSE",
  "youtube.com": "YouTube",
  "instagram.com": "Instagram",
  "pinterest.com": "Pinterest",
  "tiktok.com": "TikTok",
};

/** A pasted address as a link reference (mbmParseUrl); null if it has no domain. */
export function parseLink(raw: string) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/\./.test(u.hostname)) return null;
    const domain = u.hostname.replace(/^www\./, "");
    const base = domain.split(".").slice(-2, -1)[0] || domain;
    const name =
      KNOWN_SITES[domain] ||
      (base.length <= 3
        ? domain
        : base.charAt(0).toUpperCase() + base.slice(1));
    const seg = decodeURIComponent(
      u.pathname.split("/").filter(Boolean).pop() || ""
    );
    const title =
      seg && !/^\d+$/.test(seg)
        ? seg
            .replace(/[-_]+/g, " ")
            .replace(/\.[a-z]+$/i, "")
            .replace(/^./, (c) => c.toUpperCase())
        : name;
    return { url: u.href, domain, name, title };
  } catch {
    return null;
  }
}

export const LINK_ERROR = "That doesn’t look like a link — it needs a domain.";

/** Whether the current step can be saved, and why not. */
export function checkAdd(a: AddAsk): { ok: boolean; error: string | null } {
  if (a.step === "link") {
    if (!a.link.trim()) return { ok: false, error: null };
    return parseLink(a.link)
      ? { ok: true, error: null }
      : { ok: false, error: LINK_ERROR };
  }
  if (a.step === "note") return { ok: !!a.note.trim(), error: null };
  if (a.step === "color") return { ok: true, error: null };
  return { ok: false, error: null };
}

/** The reference the add sheet makes (PhbAddSheet.save), or null if it cannot yet. */
export function addDraft(a: AddAsk): BoardItemDraft | null {
  if (!checkAdd(a).ok) return null;
  if (a.step === "link") {
    const p = parseLink(a.link);
    return p
      ? {
          kind: "link",
          url: p.url,
          title: p.title,
          source: { name: p.name, domain: p.domain },
          ratio: 0.75,
        }
      : null;
  }
  if (a.step === "color") {
    const c = pickedColour(a);
    return { kind: "color", color: c.color, colorName: c.name, ratio: 0.8 };
  }
  if (a.step === "note")
    return { kind: "note", text: a.note.trim(), ratio: 0.7 };
  return null;
}

/** The references matching a query on the board page's pull-down (at most six). */
export function searchItems(items: readonly PhoneBoardItem[], q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const has = (v: unknown) =>
    String(v ?? "")
      .toLowerCase()
      .includes(s);
  return items
    .filter(
      (it) =>
        has(it.title) ||
        has(it.text) ||
        has(it.colorName) ||
        has(it.color) ||
        has(it.source?.name) ||
        has(it.source?.domain)
    )
    .slice(0, 6);
}

export function referenceCount(n: number) {
  return `${n} ${n === 1 ? "reference" : "references"}`;
}

/* ── Editing a reference (PhbItemSheet) ── */

/** What the item sheet's fields hold while it is open. */
export interface ItemForm {
  title: string;
  text: string;
  colorName: string;
  color: string;
}

export const formOf = (it: PhoneBoardItem): ItemForm => ({
  title: it.title || "",
  text: it.text || "",
  colorName: it.colorName || "",
  color: it.color || "",
});

const SIX = /^#?[0-9a-f]{6}$/i;

/**
 * The fields that changed (PhbItemSheet `close`), or null when nothing did.
 * A note's words and a colour's hex cannot be emptied (the route refuses),
 * so those edits are dropped rather than sent; any other caption can be
 * cleared (null).
 */
export function itemPatch(
  it: PhoneBoardItem,
  f: ItemForm
): BoardItemPatch | null {
  const p: BoardItemPatch = {};
  if (it.kind !== "note" && it.kind !== "color" && f.title !== (it.title || ""))
    p.title = f.title.trim() || null;
  if (f.text !== (it.text || "")) {
    const t = f.text.trim();
    if (it.kind === "note") {
      if (t) p.text = t;
    } else p.text = t || null;
  }
  if (it.kind === "color") {
    if (f.colorName !== (it.colorName || ""))
      p.colorName = f.colorName.trim() || "Colour";
    if (SIX.test(f.color.trim())) {
      const hex = `#${f.color.trim().replace(/^#/, "").toUpperCase()}`;
      if (hex !== (it.color || "").toUpperCase()) p.color = hex;
    }
  }
  return Object.keys(p).length ? p : null;
}

/**
 * The one line under a board card (PhbBoardCard): "From Lena" on a board that
 * is someone else's, else how many references it holds ("Canvas board" when
 * the old canvas holds them and no row does).
 */
export function cardMeta(b: {
  accessRole?: string | null;
  owner?: { name: string | null; email: string | null } | null;
  itemCount?: number | null;
  hasCanvas?: boolean;
}) {
  if (b.accessRole && b.accessRole !== "FULL_ACCESS") {
    const name = b.owner?.name || b.owner?.email?.split("@")[0];
    if (name) return `From ${name}`;
  }
  if (!b.itemCount && b.hasCanvas) return "Canvas board";
  return referenceCount(b.itemCount ?? 0);
}
