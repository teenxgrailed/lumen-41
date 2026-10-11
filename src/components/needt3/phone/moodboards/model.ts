/**
 * The phone Moodboards rules, pure (phone-habits.jsx PhbBoards, PhbBoardCard,
 * PhbWall; Mobile.jsx Mbm* helpers). A board is a grid of references, not a
 * canvas (data map §7). What the API serves today is the board row; the
 * references themselves (`MoodboardItem`) have no route, so the wall's input
 * type is declared here and nothing fills it yet.
 */
import { formatInTimeZone } from "@/lib/date-utils";
import { proLimitFull, proLimitText } from "@/lib/needt3/paywall";

import { FREE_BOARDS, boardGate } from "../../places/derive";

export { FREE_BOARDS };

/** A reference on a board (prisma `MoodboardItem`, prototype `BoardItem`). */
export interface PhoneBoardItem {
  id: string;
  kind: "image" | "link" | "color" | "note";
  url: string | null;
  color: string | null;
  text: string | null;
  title: string | null;
  ratio: number | null;
  colorName: string | null;
  source: { name?: string; domain?: string } | null;
  thumbnailUrl: string | null;
}

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
