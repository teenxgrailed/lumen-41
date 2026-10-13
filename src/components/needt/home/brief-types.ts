/* THE BRIEF'S OBJECT MODEL — one shape, two readings.
 *
 * `ProseForm` and `CanvasForm` are two views of the same list: writing a line
 * in Prose is placing an object on Canvas, and dragging an object on Canvas
 * is writing a line in Prose. So the object is one flat, loosely-typed shape
 * — the fields a `kind` does not use are simply absent — the same way
 * `RbShape` stays flat rather than a discriminated union, because the
 * renderer (`BriefObjectBody.tsx`) is the only place that ever needs to know
 * which fields a kind reads.
 */

/** Eight kinds plus the Marey plan-versus-actual chart, per PORT.md §3. */
export type BriefObjectKind =
  | "heading"
  | "text"
  | "checklist"
  | "metric"
  | "marey"
  | "card"
  | "quote"
  | "image"
  | "drawing"
  | "email";

export interface BriefChecklistItem {
  label: string;
  done: boolean;
}

/**
 * Who wrote an object. Authorship without a byline: the text colour and the
 * margin mark carry it, never a label. `you` is silent — no mark at all.
 *
 * The named ids below are the ones with a colour of their own. The type does
 * not stop there, because the list of tools a person can connect is not ours
 * to close: anything else is an agent id, and it renders in the neutral agent
 * ink with a mark, never silently as `you`. A connected tool whose text is
 * indistinguishable from the person's own is the one outcome this whole
 * mechanism exists to prevent.
 */
export type KnownBriefAuthorId =
  | "you"
  | "needt"
  | "agent"
  | "linear"
  | "github";

/** A known author, or any connected tool's own id. */
export type BriefAuthorId = KnownBriefAuthorId | (string & {});

export interface BriefAuthorInfo {
  name: string;
  /** The colour the object's own text is drawn in. */
  color: string;
  /** The colour of the small mark in the margin. Unused for `you`. */
  mark: string;
}

export const BRIEF_AUTHORS: Readonly<
  Record<KnownBriefAuthorId, BriefAuthorInfo>
> = Object.freeze({
  you: {
    name: "You",
    color: "var(--text-primary)",
    mark: "var(--text-quaternary)",
  },
  needt: { name: "Needt", color: "var(--accent)", mark: "var(--accent)" },
  /* Everything connected that is not one of the named tools. One ink for all
     of them: the point is that it is not yours, not which one it is. */
  agent: { name: "Agent", color: "var(--warning)", mark: "var(--warning)" },
  linear: { name: "Linear", color: "var(--info)", mark: "var(--info)" },
  github: { name: "GitHub", color: "var(--success)", mark: "var(--success)" },
});

/**
 * The ink an author writes in.
 *
 * `name` is what a tool called itself when it connected, where we have it —
 * an id is a poor label, but it is an honest one, and far better than
 * borrowing the person's. Unknown ids never fall back to `you`.
 */
export function briefAuthor(id: string, name?: string): BriefAuthorInfo {
  const known = (BRIEF_AUTHORS as Record<string, BriefAuthorInfo>)[id];
  if (known) return known;
  return { ...BRIEF_AUTHORS.agent, name: name?.trim() || id || "Agent" };
}

/**
 * One object on the canvas, one block in the document. `x`/`y`/`w` place it
 * on Canvas; Prose ignores them and reads the list in array order instead.
 * Fields below the layout ones are each read by exactly one `kind` — see
 * `BriefObjectBody`.
 */
export interface BriefObject {
  id: string;
  kind: BriefObjectKind;
  author: string;
  x: number;
  y: number;
  w: number;
  h?: number;
  /** Written in the flow rather than placed by hand — Prose's own tail. */
  tail?: boolean;
  /** Needt's objects type themselves in, character by character, once. */
  typed?: boolean;

  /* heading / text / quote */
  text?: string;
  source?: string;

  /* checklist */
  items?: readonly BriefChecklistItem[];

  /* metric */
  value?: string;
  caption?: string;

  /* marey */
  total?: number;
  actual?: readonly number[];
  days?: readonly string[];

  /* card */
  title?: string;
  meta?: string;
  tone?: string;

  /* email */
  to?: string;
  subject?: string;
  body?: string;

  /* drawing */
  path?: string;
}

/** The tools a person can drop on the canvas, or insert with `/` in Prose —
 * in the order a person reaches for them. Both surfaces share this list. */
export const BRIEF_TOOLS: readonly { kind: BriefObjectKind; label: string }[] =
  Object.freeze([
    { kind: "text", label: "Text" },
    { kind: "heading", label: "Heading" },
    { kind: "checklist", label: "Checklist" },
    { kind: "quote", label: "Quote" },
    { kind: "card", label: "Task or event" },
    { kind: "metric", label: "Number" },
    { kind: "marey", label: "Plan against fact" },
    { kind: "image", label: "Image" },
    { kind: "drawing", label: "Drawing" },
    { kind: "email", label: "Email draft" },
  ]);

/** A fresh object of one kind, positioned wherever the caller decides. */
export function briefBlank(
  kind: BriefObjectKind,
  id: string,
  at: { x: number; y: number }
): BriefObject {
  const base: BriefObject = {
    id,
    kind,
    author: "you",
    x: at.x,
    y: at.y,
    w: 320,
  };
  switch (kind) {
    case "heading":
    case "text":
      return { ...base, text: "" };
    case "quote":
      return { ...base, text: "", source: "" };
    case "checklist":
      return { ...base, items: [{ label: "", done: false }] };
    case "metric":
      return { ...base, w: 240, value: "0", caption: "what this counts" };
    case "marey":
      return { ...base, w: 300, total: 20, actual: [0, 3, 5, 8, 9] };
    case "card":
      return { ...base, title: "Pick a task", meta: "no date" };
    case "email":
      return { ...base, to: "someone@needt.app", subject: "Subject", body: "" };
    case "image":
      return { ...base, w: 268, h: 160 };
    case "drawing":
      return {
        ...base,
        w: 268,
        h: 130,
        path: "M20 100 C 60 30, 120 110, 250 44",
      };
    default:
      return base;
  }
}
