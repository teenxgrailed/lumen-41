/**
 * Right-click everywhere (prototype ctx.jsx): mark an element with
 * `data-ctx="<kind>"` (+ `data-ctx-id`) and the kind's resolver builds its
 * menu. Each stream registers the kinds it owns (`registerCtx("task", …)`)
 * from the component that has the data; anything unmarked gets "app".
 */

export interface CtxRow {
  label: string;
  run?: () => void;
  tone?: "danger" | "title";
  /** Right-hand hint: a shortcut, a count, or "›" for a submenu. */
  hint?: string;
  /** Rows shown in place of the menu when chosen (Move to…, Sort by). */
  sub?: CtxRow[];
}

/** Groups are split by a hairline. */
export type CtxMenu = CtxRow[][];

export type CtxResolver = (target: {
  el: HTMLElement | null;
  id: string | null;
}) => CtxMenu | null;

const registry = new Map<string, CtxResolver>();

/** Register a kind; returns the unregister function (use it in an effect). */
export function registerCtx(kind: string, resolve: CtxResolver) {
  registry.set(kind, resolve);
  return () => {
    if (registry.get(kind) === resolve) registry.delete(kind);
  };
}

/** The menu for a marked element; an unknown kind falls back to "app". */
export function ctxMenuFor(el: HTMLElement | null): CtxMenu | null {
  const kind = el?.getAttribute("data-ctx") ?? "app";
  const id = el?.getAttribute("data-ctx-id") ?? null;
  const own = registry.get(kind)?.({ el, id });
  if (own && own.length) return own;
  return registry.get("app")?.({ el: null, id: null }) ?? null;
}

/** A submenu replaces the menu: its title row on top, then its rows. */
export function openSub(row: CtxRow): CtxMenu {
  return [
    [{ label: row.label.replace("…", ""), tone: "title" }],
    row.sub ?? [],
  ];
}

/** Estimated height, to flip the menu above the pointer near the bottom. */
export function ctxHeight(menu: CtxMenu) {
  return (
    menu.reduce((s, g) => s + g.length * 36, 0) + (menu.length - 1) * 11 + 12
  );
}
