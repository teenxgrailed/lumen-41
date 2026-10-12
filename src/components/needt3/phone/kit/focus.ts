/**
 * Focus and stacking for the kit's modal sheets, pure where it can be so it is
 * tested apart from the DOM.
 */

/* ---------- the sheet stack ---------- */

const stack: symbol[] = [];

/** A sheet opens: it is now the top. Returns its token. */
export function stackPush() {
  const id = Symbol("pk-sheet");
  stack.push(id);
  return id;
}

/** A sheet closes (or unmounts): it leaves the stack wherever it sits. */
export function stackRemove(id: symbol) {
  const i = stack.indexOf(id);
  if (i >= 0) stack.splice(i, 1);
}

/** Only the top sheet answers Esc (and the Tab trap). */
export const stackIsTop = (id: symbol) => stack[stack.length - 1] === id;

export const stackDepth = () => stack.length;

/* ---------- the Tab trap ---------- */

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Where Tab (or Shift+Tab) goes inside a trap of `count` focusables when the
 * focus is at `index` (-1 = outside them). Returns the index to focus, or null
 * to let the browser move focus on its own (it stays inside the trap).
 */
export function trapTarget(
  count: number,
  index: number,
  shift: boolean
): number | null {
  if (count <= 0) return null;
  if (index < 0) return shift ? count - 1 : 0;
  if (!shift && index === count - 1) return 0;
  if (shift && index === 0) return count - 1;
  return null;
}

/** The elements of `root` a Tab can reach, in DOM order. */
export function focusablesIn(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true"
  );
}

/** Keep Tab inside `root`. Returns true when it moved the focus itself. */
export function trapTab(e: KeyboardEvent, root: Element): boolean {
  if (e.key !== "Tab") return false;
  const items = focusablesIn(root);
  const at = items.indexOf(document.activeElement as HTMLElement);
  const to = trapTarget(items.length, at, e.shiftKey);
  if (to === null) return false;
  e.preventDefault();
  items[to].focus({ preventScroll: true });
  return true;
}
