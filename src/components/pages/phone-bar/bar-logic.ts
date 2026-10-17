/**
 * The decisions behind the phone's editing bar, pure so they are tested apart
 * from the DOM: where the keyboard is (from the visual viewport), which block
 * type the caret is in, what the block menu offers and what indent does.
 */
import type { Editor } from "@tiptap/core";

/* ── the keyboard ── */

/** Below this the visual viewport only moved with the browser's own bars. */
export const KEYBOARD_MIN = 80;
/** Once the keyboard is up it stays "up" while it covers at least this much
 *  (its own suggestion row grows and shrinks; the bar must not flicker). */
export const KEYBOARD_STAY = 40;

export interface BarOffset {
  /** How far the keyboard covers the bottom of the layout viewport, px. */
  lift: number;
  open: boolean;
}

export const NO_KEYBOARD: BarOffset = { lift: 0, open: false };

/**
 * The bar's offset from the visual viewport. Three guards keep it still while
 * the page scrolls, which is when a naive reading jumps:
 *  - `offsetTop` is clamped to what the keyboard leaves: iOS rubber-bands the
 *    visual viewport past it while the page is dragged, and a raw reading
 *    swings the bar by that overshoot;
 *  - a pinch-zoomed page (scale above 1) keeps the last answer, because
 *    `innerHeight - height` then measures the zoom, not the keyboard;
 *  - the keyboard counts as up from 80 px and as down only under 40 px.
 */
export function barOffset(
  input: {
    innerHeight: number;
    vvHeight: number;
    vvOffsetTop: number;
    scale?: number;
  },
  prev: BarOffset = NO_KEYBOARD
): BarOffset {
  const { innerHeight, vvHeight, vvOffsetTop, scale = 1 } = input;
  if (scale > 1.02) return prev;
  const room = Math.max(0, innerHeight - vvHeight);
  const top = Math.min(Math.max(0, vvOffsetTop), room);
  const lift = Math.max(0, Math.round(innerHeight - vvHeight - top));
  const open = prev.open ? lift >= KEYBOARD_STAY : lift >= KEYBOARD_MIN;
  return open ? { lift, open: true } : NO_KEYBOARD;
}

/** The bar's own row (px); a panel opened above it adds to this. */
export const BAR_ROW_PX = 48;

/** The bar's transform for a keyboard `lift`: it rides on the keyboard. */
export const barTransform = (lift: number) =>
  `translate3d(0, ${lift > 0 ? -lift : 0}px, 0)`;

/**
 * How far to scroll so the caret line sits clear of the bar: positive moves
 * the content up (the caret is under the bar), negative down (under the top
 * edge). Coordinates are viewport ones. The bottom wins when the band is
 * smaller than the line.
 */
export function caretScrollDelta(input: {
  caretTop: number;
  caretBottom: number;
  viewTop: number;
  viewBottom: number;
  margin?: number;
}): number {
  const { caretTop, caretBottom, viewTop, viewBottom, margin = 16 } = input;
  if (caretBottom > viewBottom - margin)
    return Math.round(caretBottom - (viewBottom - margin));
  if (caretTop < viewTop + margin)
    return Math.round(caretTop - (viewTop + margin));
  return 0;
}

/** The padding the scroll area needs so its last line clears the bar. */
export const barInset = (lift: number, barHeight: number) =>
  Math.max(0, Math.round(lift)) + Math.max(barHeight, BAR_ROW_PX);

/** The nearest ancestor that scrolls vertically, or null (the window does). */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === "auto" || overflowY === "scroll") return p;
  }
  return null;
}

/**
 * Keeps the bar on the keyboard as the visual viewport moves. The bar is
 * `position: fixed; bottom: 0` (laid out against the layout viewport, which
 * iOS does not shrink for the keyboard), so what moves it is the transform
 * written here: `-(innerHeight - vv.height - vv.offsetTop)`, through
 * `barOffset`'s guards. It also writes `--page-kb` and `data-kb`. Written
 * straight from the event (no React state, so no frame of lag) and read again
 * one frame later, because iOS reports the final geometry once the keyboard
 * has settled. `onChange` hears each new lift. Returns the cleanup.
 */
export function trackKeyboard(
  el: HTMLElement,
  onChange?: (lift: number) => void
): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  let last: BarOffset = { lift: -1, open: false };
  let frame = 0;
  const apply = () => {
    const next = barOffset(
      {
        innerHeight: window.innerHeight,
        vvHeight: vv.height,
        vvOffsetTop: vv.offsetTop,
        scale: vv.scale,
      },
      last.lift < 0 ? NO_KEYBOARD : last
    );
    if (next.lift === last.lift && next.open === last.open) return;
    last = next;
    el.style.setProperty("--page-kb", `${next.lift}px`);
    el.style.transform = barTransform(next.lift);
    el.dataset.kb = next.open ? "open" : "rest";
    onChange?.(next.lift);
  };
  const onEvent = () => {
    apply();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };
  apply();
  vv.addEventListener("resize", onEvent);
  vv.addEventListener("scroll", onEvent);
  window.addEventListener("orientationchange", onEvent);
  return () => {
    cancelAnimationFrame(frame);
    vv.removeEventListener("resize", onEvent);
    vv.removeEventListener("scroll", onEvent);
    window.removeEventListener("orientationchange", onEvent);
    el.style.removeProperty("--page-kb");
    el.style.removeProperty("transform");
    delete el.dataset.kb;
  };
}

/* ── block types ── */

export type BlockTypeId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "ordered"
  | "taskItem"
  | "checklist"
  | "TOGGLE"
  | "CALLOUT"
  | "quote"
  | "code"
  | "divider"
  | "IMAGE"
  | "TABLE";

/** What the block menu offers, in order (the ids are the editor's command ids). */
export const BLOCK_MENU: ReadonlyArray<{ id: BlockTypeId; label: string }> = [
  { id: "paragraph", label: "Text" },
  { id: "heading1", label: "Heading 1" },
  { id: "heading2", label: "Heading 2" },
  { id: "heading3", label: "Heading 3" },
  { id: "bullet", label: "Bulleted list" },
  { id: "ordered", label: "Numbered list" },
  { id: "taskItem", label: "Task" },
  { id: "checklist", label: "Checklist" },
  { id: "TOGGLE", label: "Toggle" },
  { id: "CALLOUT", label: "Callout" },
  { id: "quote", label: "Quote" },
  { id: "code", label: "Code" },
  { id: "divider", label: "Divider" },
  { id: "IMAGE", label: "Image" },
  { id: "TABLE", label: "Table" },
];

/** The facts about the caret's block the bar reads. */
export interface CaretFacts {
  heading: number | null;
  bullet: boolean;
  ordered: boolean;
  taskItem: boolean;
  /** The task item is a real Needt task, not a plain checklist line. */
  isTask: boolean;
  toggle: boolean;
  callout: boolean;
  quote: boolean;
  code: boolean;
}

/** Which menu entry the caret is in (and so what the bar's first button says). */
export function blockTypeOf(f: CaretFacts): BlockTypeId {
  if (f.code) return "code";
  if (f.heading === 1) return "heading1";
  if (f.heading === 2) return "heading2";
  if (f.heading === 3) return "heading3";
  if (f.taskItem) return f.isTask ? "taskItem" : "checklist";
  if (f.bullet) return "bullet";
  if (f.ordered) return "ordered";
  if (f.callout) return "CALLOUT";
  if (f.toggle) return "TOGGLE";
  if (f.quote) return "quote";
  return "paragraph";
}

export const blockLabel = (id: BlockTypeId) =>
  BLOCK_MENU.find((b) => b.id === id)?.label ?? "Text";

export function caretFacts(editor: Editor): CaretFacts {
  const level = [1, 2, 3].find((l) => editor.isActive("heading", { level: l }));
  return {
    heading: level ?? null,
    bullet: editor.isActive("bulletList"),
    ordered: editor.isActive("orderedList"),
    taskItem: editor.isActive("taskItem"),
    isTask: editor.isActive("taskItem", { task: true }),
    toggle: editor.isActive("needtToggle"),
    callout: editor.isActive("needtCallout"),
    quote: editor.isActive("blockquote"),
    code: editor.isActive("codeBlock"),
  };
}

/* ── indent ── */

const LIST_ITEMS = ["taskItem", "listItem"] as const;

/** The list item type the caret is in, if any: the one indent and outdent move. */
export function indentTarget(editor: Editor): "taskItem" | "listItem" | null {
  return LIST_ITEMS.find((name) => editor.isActive(name)) ?? null;
}

/** Whether indent (`in`) or outdent (`out`) would do anything here. */
export function canIndent(editor: Editor, dir: "in" | "out"): boolean {
  const name = indentTarget(editor);
  if (!name) return false;
  return dir === "in"
    ? editor.can().sinkListItem(name)
    : editor.can().liftListItem(name);
}

/** Indent or outdent the list item the caret is in. */
export function indent(editor: Editor, dir: "in" | "out"): boolean {
  const name = indentTarget(editor);
  if (!name) return false;
  const chain = editor.chain().focus();
  return (
    dir === "in" ? chain.sinkListItem(name) : chain.liftListItem(name)
  ).run();
}
