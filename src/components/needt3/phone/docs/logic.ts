/**
 * The decisions behind the phone Docs (prototype phone-docs.jsx), pure so they
 * are tested apart from the DOM: the sort line under the title, the Quick Open
 * filter, the Page Style sheet's Background choice and which style writes need
 * Pro, the left-edge swipe back and the reader's scroll variables.
 */
import { axisOf } from "@/lib/needt3/gesture";
import type { V3Doc } from "@/lib/needt3/map";

import { ageLabel } from "../../docs/labels";
import { proStyleChanges } from "../../docs/pro-style";
import { DOC_SORTS, type DocSort } from "../../docs/sort";
import { type DocStyle, coverArtId, stylePatch } from "../../docs/style";

/* ── the list ── */

const SORT_WORDS: Record<DocSort["key"], string> = {
  name: "By name",
  viewed: "Recently viewed",
  created: "Recently created",
  updated: "Recently edited",
};

/** The sort in words (pdSortLine): what the list is ordered by. */
export function sortLine(sort: DocSort) {
  if (sort.key === "name") {
    return sort.dir === "desc" ? "By name, Z to A" : SORT_WORDS.name;
  }
  if (sort.dir === "asc") {
    const label = DOC_SORTS.find(([k]) => k === sort.key)?.[1] ?? sort.key;
    return `${label}, oldest first`;
  }
  return SORT_WORDS[sort.key];
}

/** The line under the large title: "3 documents · Recently edited". */
export function docsSub(count: number, sort: DocSort) {
  if (!count) return null;
  return `${count} ${count === 1 ? "document" : "documents"} · ${sortLine(sort)}`;
}

const nameOf = (d: Pick<V3Doc, "title">) => d.title || "Untitled";

/**
 * Quick Open and the pull-down: documents whose title has the words in it.
 * (The list API sends no block text, so the prototype's "and text" half is
 * not possible; see the handoff.)
 */
export function matchDocs<T extends Pick<V3Doc, "title">>(
  docs: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...docs];
  return docs.filter((d) => nameOf(d).toLowerCase().includes(needle));
}

export interface PullDocHit {
  id: string;
  title: string;
  meta?: string;
}

/** Up to five title hits for the pull-down plate, newest as given. */
export function pullHits(
  docs: readonly V3Doc[],
  query: string,
  now: number
): PullDocHit[] {
  return matchDocs(docs, query)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      title: nameOf(d),
      meta: ageLabel(d.updatedAt, now) || undefined,
    }));
}

/** A card's second line: the project (when it has one) and how long ago. */
export function cardMeta(
  doc: Pick<V3Doc, "updatedAt">,
  project: { name: string; color: string | null } | null,
  now: number
) {
  return { project, age: ageLabel(doc.updatedAt, now) };
}

/* ── Page Style: Background ── */

export type BgKind = "none" | "solid" | "gradient" | "image";

export const BG_KINDS: [BgKind, string][] = [
  ["none", "None"],
  ["solid", "Solid"],
  ["gradient", "Gradient"],
  ["image", "Image"],
];

const BG_OF: Record<string, BgKind> = {
  mist: "gradient",
  sparkle: "gradient",
  dunes: "image",
  sage: "image",
  ocean: "image",
  ink: "image",
  grid: "image",
};

/** The backdrops each pictured kind offers (ids of `DOC_BACKDROPS`). */
export const BG_LIST: Record<"gradient" | "image", string[]> = {
  gradient: ["mist", "sparkle"],
  image: ["dunes", "sage", "ocean", "ink", "grid"],
};

/** Which Background choice the page's style is on now. */
export function bgKind(s: Pick<DocStyle, "backdrop" | "page">): BgKind {
  if (s.backdrop !== "none") return BG_OF[s.backdrop] ?? "image";
  return s.page !== "white" ? "solid" : "none";
}

/**
 * What choosing a Background kind writes. Solid keeps no backdrop and asks for
 * the page colour next (`pickColour`); Gradient and Image keep the backdrop
 * already chosen when it is of that kind, else the kind's first.
 */
export function bgChoice(
  kind: BgKind,
  s: Pick<DocStyle, "backdrop" | "page">
): { patch: Partial<DocStyle>; pickColour: boolean } {
  if (kind === "none") {
    return { patch: { backdrop: "none", page: "white" }, pickColour: false };
  }
  if (kind === "solid")
    return { patch: { backdrop: "none" }, pickColour: true };
  const keep = BG_OF[s.backdrop] === kind ? s.backdrop : BG_LIST[kind][0];
  return { patch: { backdrop: keep }, pickColour: false };
}

/* ── Page Style: the Pro gate (the desktop's rule, ../../docs/pro-style) ── */

/** The cover choices: none, one of the drawn arts (`art:<theme>`), or a picture. */
export type CoverKind = "none" | "art" | "image";
export const coverKind = (cover: string | null): CoverKind =>
  cover ? (coverArtId(cover) ? "art" : "image") : "none";

type StyledDoc = Pick<V3Doc, "coverUrl" | "style">;

/**
 * Whether a style change would set a Pro value the page did not already
 * have. A free plan (or one still loading) may not make it: the screen shows
 * the paywall instead of writing, and the server refuses it too (403).
 */
export function needsPro(doc: StyledDoc, patch: Partial<DocStyle>) {
  const next = stylePatch(doc, patch);
  return (
    proStyleChanges(doc.style, next.style, {
      before: doc.coverUrl,
      after: next.coverUrl,
    }).length > 0
  );
}

/** True when the plan may write Pro style values: known, and not Free. */
export const planIsPro = (kind: string | undefined | null) =>
  !!kind && kind !== "free";

/* ── the reader: slide, edge swipe, scroll ── */

/** The left strip a back swipe may start in, px. */
export const EDGE = 24;

export const startsAtEdge = (clientX: number, left: number) =>
  clientX - left >= 0 && clientX - left <= EDGE;

/** What a press that has moved is: the back swipe, something else, or not yet. */
export function edgeIntent(dx: number, dy: number): "back" | "none" | null {
  const axis = axisOf(dx, dy, 6, 1);
  if (!axis) return null;
  return axis === "x" && dx > 0 ? "back" : "none";
}

/** How far the page has left (0 open .. 1 gone) for a finger offset. */
export const edgeProgress = (dx: number, width: number) =>
  width > 0 ? Math.min(1, Math.max(0, dx / width)) : 0;

/**
 * What a released swipe does. A cancel (pointercancel, a hold that took the
 * finger) never goes back, whatever the page last showed; an up goes back
 * past 40% of the width, or on a quick flick (0.45 px/ms) that has left the
 * edge. `v` is px/ms, positive to the right.
 */
export function edgeRelease(
  reason: "up" | "cancel",
  progress: number,
  v: number
): "back" | "stay" {
  if (reason === "cancel") return "stay";
  return progress > 0.4 || (v > 0.45 && progress > 0.06) ? "back" : "stay";
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * The reader's scroll variables for a scroll offset: the bottom fog (1 while
 * there is more to scroll).
 */
export function scrollVars(
  y: number,
  scrollHeight: number,
  clientHeight: number
) {
  return {
    fog: clamp((scrollHeight - clientHeight - y - 40) / 60, 0, 1),
  };
}

/**
 * The keyboard's height from the visual viewport (0 when it is not up).
 * `vvOffsetTop` is clamped to what the keyboard leaves: iOS rubber-bands the
 * visual viewport past it while the page is dragged, and the raw reading would
 * swing the bar by that overshoot (the bar jumping as the page scrolls).
 */
export function keyboardLift(
  innerHeight: number,
  vvHeight: number,
  vvOffsetTop: number
) {
  const room = Math.max(0, innerHeight - vvHeight);
  const top = Math.min(Math.max(0, vvOffsetTop), room);
  return Math.max(0, Math.round(innerHeight - vvHeight - top));
}

/**
 * How far the reader's top chips (‹ Docs, Done) move down while the page is
 * edited, so they stay where they were on the glass, below the status bar.
 * With the keyboard up iOS pans the visual viewport (`vvOffsetTop`) and may
 * scroll the document (the reader's `hostTop` goes negative) to reveal the
 * caret; either carries the chips up under the status bar's blur, where they
 * are hard to see and to tap. The pin gives both back, never pulls the chips
 * above their rest, and a pinch-zoomed page (scale above 1) keeps them still.
 */
export function headerPin(input: {
  vvOffsetTop: number;
  hostTop: number;
  scale?: number;
}) {
  const { vvOffsetTop, hostTop, scale = 1 } = input;
  if (scale > 1.02) return 0;
  return Math.max(0, Math.round(Math.max(0, vvOffsetTop) - hostTop));
}
