/**
 * Dragging a block from the Insert tab into the page. A pointer press on a
 * row that moves more than a few pixels lifts a ghost of the row that follows
 * the pointer; over the page a line between two top-level blocks shows where
 * the block will land; letting go there inserts it (the same command a click
 * sends, with the boundary's index); Esc, a lost pointer or a release outside
 * the page cancels. Near the top and bottom of the page's scroller it scrolls.
 *
 * Pointer events and plain DOM, no HTML5 drag: the editor's own drop handling
 * (images, text) stays out of it, and the ghost and the line are drawn by us.
 */
import { runPageCommand } from "@/components/pages/page-commands";

export interface Span {
  top: number;
  bottom: number;
}

/** Pointer travel before a press becomes a drag (a click stays a click). */
export const DRAG_SLOP = 5;
/** Height of the band at each edge of the scroller that scrolls it. */
export const EDGE_ZONE = 64;
/** Fastest autoscroll, in pixels per frame. */
export const EDGE_MAX = 22;
/** A click this soon after a drag ended is the drag's own and is ignored. */
export const CLICK_GUARD_MS = 350;

/** The block boundary under a pointer at `y`: 0 before the first block, N after the last. */
export function dropIndexAt(blocks: Span[], y: number): number {
  for (let i = 0; i < blocks.length; i++) {
    if (y < (blocks[i].top + blocks[i].bottom) / 2) return i;
  }
  return blocks.length;
}

/** The y of the line that marks boundary `index`: halfway through the gap between two blocks. */
export function dropLineAt(blocks: Span[], index: number): number | null {
  if (blocks.length === 0) return null;
  if (index <= 0) return blocks[0].top - 4;
  if (index >= blocks.length) return blocks[blocks.length - 1].bottom + 4;
  return (blocks[index - 1].bottom + blocks[index].top) / 2;
}

/** Pixels per frame to scroll for a pointer at `y` in a scroller spanning `box`; negative is up. */
export function edgeSpeed(
  y: number,
  box: Span,
  zone = EDGE_ZONE,
  max = EDGE_MAX
): number {
  if (y < box.top + zone) {
    return -Math.round(max * Math.min(1, (box.top + zone - y) / zone));
  }
  if (y > box.bottom - zone) {
    return Math.round(max * Math.min(1, (y - (box.bottom - zone)) / zone));
  }
  return 0;
}

let lastDragEnd = -Infinity;

/** True for a click that is the tail of a drag that just ended. */
export function clickIsDragTail(now = performance.now()): boolean {
  return now - lastDragEnd < CLICK_GUARD_MS;
}

const pageEditor = () =>
  document.querySelector<HTMLElement>("[data-doc-sheet] .needt-page-editor");
const pageSheet = () => document.querySelector<HTMLElement>("[data-doc-sheet]");
const pageScroller = () =>
  document.querySelector<HTMLElement>("[data-doc-page]");

/**
 * Begin tracking a press on an Insert row. Returns a cancel function; the
 * tracking ends by itself on release, Esc or pointercancel.
 */
export function trackInsertPress(
  down: PointerEvent,
  row: HTMLElement,
  pageId: string,
  command: string
): () => void {
  if (down.button !== 0 || down.pointerType === "touch") return () => {};
  const host = row.closest<HTMLElement>(".needt-v3") ?? document.body;
  const startX = down.clientX;
  const startY = down.clientY;
  let dragging = false;
  let x = startX;
  let y = startY;
  let index: number | null = null;
  let ghost: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let raf = 0;

  const blocks = (): HTMLElement[] => {
    const root = pageEditor();
    if (!root) return [];
    return Array.from(root.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el.getBoundingClientRect().height > 0
    );
  };

  const place = () => {
    if (ghost)
      ghost.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
    const sheet = pageSheet();
    const scroller = pageScroller();
    const sheetBox = sheet?.getBoundingClientRect();
    const box = scroller?.getBoundingClientRect();
    const over =
      !!sheetBox &&
      !!box &&
      x >= sheetBox.left &&
      x <= sheetBox.right &&
      y >= box.top &&
      y <= box.bottom;
    const list = blocks();
    const spans = list.map((el) => el.getBoundingClientRect());
    const lineY = over ? dropLineAt(spans, dropIndexAt(spans, y)) : null;
    index = over && lineY !== null ? dropIndexAt(spans, y) : null;
    if (ghost) ghost.dataset.over = index === null ? "no" : "yes";
    if (index === null || lineY === null || !list.length) {
      line?.remove();
      line = null;
      return;
    }
    const editorBox = (pageEditor() as HTMLElement).getBoundingClientRect();
    if (!line) {
      line = document.createElement("div");
      line.className = "docs-insert-drop-line";
      line.setAttribute("aria-hidden", "true");
      line.dataset.insertDropLine = "";
      host.appendChild(line);
    }
    line.style.top = `${lineY - 1}px`;
    line.style.left = `${editorBox.left}px`;
    line.style.width = `${editorBox.width}px`;
    line.dataset.index = String(index);
  };

  const frame = () => {
    raf = 0;
    if (!dragging) return;
    const scroller = pageScroller();
    if (scroller) {
      const speed = edgeSpeed(y, scroller.getBoundingClientRect());
      if (speed) scroller.scrollBy({ top: speed, behavior: "instant" });
    }
    place();
    raf = requestAnimationFrame(frame);
  };

  const begin = () => {
    dragging = true;
    ghost = row.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-insert-command");
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.dataset.insertGhost = "";
    ghost.classList.add("docs-insert-ghost");
    ghost.style.width = `${row.getBoundingClientRect().width}px`;
    host.appendChild(ghost);
    host.dataset.insertDragging = "";
    raf = requestAnimationFrame(frame);
  };

  const end = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    ghost?.remove();
    line?.remove();
    ghost = null;
    line = null;
    delete host.dataset.insertDragging;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", cancel);
    if (dragging) lastDragEnd = performance.now();
    dragging = false;
  };

  function move(e: PointerEvent) {
    x = e.clientX;
    y = e.clientY;
    if (!dragging) {
      if (Math.hypot(x - startX, y - startY) < DRAG_SLOP) return;
      begin();
    }
    e.preventDefault();
    place();
  }
  function up(e: PointerEvent) {
    x = e.clientX;
    y = e.clientY;
    const wasDragging = dragging;
    if (wasDragging) place();
    const drop = wasDragging ? index : null;
    end();
    if (drop !== null) runPageCommand({ pageId, command, index: drop });
  }
  function cancel() {
    end();
  }
  function key(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    const wasDragging = dragging;
    end();
    // The button is still down: its release is not a click on the row.
    if (wasDragging) {
      window.addEventListener(
        "pointerup",
        () => {
          lastDragEnd = performance.now();
        },
        { once: true, capture: true }
      );
    }
  }

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
  return end;
}
