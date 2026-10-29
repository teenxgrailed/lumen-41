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

/* ── iOS 26's floating form accessory ── */

/**
 * Room iOS 26 keeps for its own form accessory: the glass "∧ ∨ ✓" pill it
 * floats above the keyboard for every focused field, contenteditable
 * included. Up to iOS 18 that row was an opaque strip and the visual viewport
 * ended above it. In iOS 26 it is Liquid Glass drawn over the page and the
 * visual viewport runs on under it, so a bar placed on the visual viewport's
 * bottom sat behind the pill (owner's screenshot, 2026-10-29: the pill on top,
 * the formatting row blurred under it). A web page can neither hide nor
 * measure that pill (only a native shell can, through `inputAccessoryView`),
 * so while the keyboard is up the bar keeps this much clear above it: the
 * pill's 44 px and the gap iOS leaves around it.
 */
export const FLOATING_ACCESSORY_PX = 52;

interface FeatureProbe {
  supports: (property: string, value: string) => boolean;
  coarse: boolean;
}

const browserProbe = (): FeatureProbe | null =>
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function"
    ? {
        supports: (p, v) => CSS.supports(p, v),
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }
    : null;

/**
 * Whether this is WebKit on iOS 26 or later (the floating accessory). The UA
 * cannot tell (iOS 26 freezes it at 18_6 and the home-screen app drops
 * `Version/`), so features decide: `-webkit-touch-callout` exists only in
 * WebKit on iOS / iPadOS, and CSS anchor positioning shipped in Safari 26.0.
 * A coarse pointer leaves out a Mac.
 */
export function hasFloatingAccessory(
  probe: FeatureProbe | null = browserProbe()
): boolean {
  if (!probe) return false;
  return (
    probe.coarse &&
    probe.supports("-webkit-touch-callout", "none") &&
    probe.supports("anchor-name", "--needt-probe")
  );
}

/** The accessory room for this browser (0 where there is no floating pill). */
export const accessoryRoom = (probe?: FeatureProbe | null) =>
  hasFloatingAccessory(probe === undefined ? browserProbe() : probe)
    ? FLOATING_ACCESSORY_PX
    : 0;

/**
 * How far the bar rides above the layout viewport's bottom: the keyboard and,
 * on iOS 26, the accessory pill floating over its top edge. Nothing at rest.
 */
export const barLift = (offset: BarOffset, accessory: number) =>
  offset.open ? offset.lift + Math.max(0, accessory) : 0;

/* ── one bar, in every state ── */

export type BarMode = "off" | "bar" | "panel";

/**
 * What the phone shows above the keyboard: exactly one of our surfaces.
 *  - The "/" sheet owns the keyboard's top edge while it is open (it lifts
 *    itself there), so the bar steps aside instead of stacking under it.
 *  - An open block-type or colour panel grows out of the bar (one surface).
 *  - Otherwise the bar shows while the editor has focus; never on the desktop.
 * `padded`: the scroll area keeps its keyboard room. It stays while the "/"
 * sheet covers the bar, or the page would jump under the sheet.
 */
export function barMode(s: {
  focused: boolean;
  panel: boolean;
  suppressed: boolean;
  desktop?: boolean;
}): { mode: BarMode; padded: boolean } {
  if (s.desktop) return { mode: "off", padded: false };
  const padded = s.focused || s.panel;
  if (s.suppressed) return { mode: "off", padded };
  if (s.panel) return { mode: "panel", padded };
  return { mode: s.focused ? "bar" : "off", padded };
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
  /** Extra room under the caret once it has to move at all (`caretLead`), so
   *  the next Enter does not scroll again one line later. */
  lead?: number;
}): number {
  const {
    caretTop,
    caretBottom,
    viewTop,
    viewBottom,
    margin = 16,
    lead = 0,
  } = input;
  if (caretBottom > viewBottom - margin)
    return Math.round(caretBottom - (viewBottom - margin - lead));
  if (caretTop < viewTop + margin)
    return Math.round(caretTop - (viewTop + margin));
  return 0;
}

/**
 * The room left under a caret brought out from under the bar: a third of the
 * visible band, at most 120 px. The approach is that of Tiptap's Simple Editor
 * template (`useCursorVisibility`, MIT, github.com/ueberdosis/tiptap-ui-components),
 * which brings a hidden caret to the middle of the screen rather than to the
 * toolbar's edge, so typing on does not scroll on every line. A third keeps
 * more of the text above in sight on a short band. Written for our scroll
 * area and bar, not copied.
 */
export const caretLead = (viewTop: number, viewBottom: number) =>
  Math.max(0, Math.min(120, Math.round((viewBottom - viewTop) / 3)));

/** The gap under the floating pill while the keyboard is up (px). */
export const BAR_GAP = 10;

/** The padding the scroll area needs so its last line clears the pill. */
export const barInset = (lift: number, barHeight: number) =>
  Math.max(0, Math.round(lift)) + Math.max(barHeight, BAR_ROW_PX) + BAR_GAP;

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
 * `barOffset`'s guards, plus iOS 26's floating accessory while the keyboard
 * is up (`barLift`). It also writes `--page-kb`, `data-kb` and `data-kb-read`. Written
 * straight from the event (no React state, so no frame of lag) and read again
 * one frame later, because iOS reports the final geometry once the keyboard
 * has settled. `onChange` hears each new lift. Returns the cleanup.
 */
export function trackKeyboard(
  el: HTMLElement,
  onChange?: (lift: number) => void,
  accessory: number = accessoryRoom()
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
    const lift = barLift(next, accessory);
    el.style.setProperty("--page-kb", `${next.lift}px`);
    el.style.transform = barTransform(lift);
    el.dataset.kb = next.open ? "open" : "rest";
    // What the bar read, for a look in Web Inspector on a device.
    el.dataset.kbRead = `${window.innerHeight}/${Math.round(vv.height)}/${Math.round(vv.offsetTop)}/${accessory}`;
    onChange?.(lift);
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
    delete el.dataset.kbRead;
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
