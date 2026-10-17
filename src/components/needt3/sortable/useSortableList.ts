"use client";

/**
 * The one sortable-list mechanism of the desktop app. Pointer and touch go
 * through @dnd-kit (transform only, the other rows slide away, auto-scroll in
 * any scrollable parent); the keyboard is the hook's own, so it is the same
 * for a column and a grid and needs no layout: space picks up, the arrows
 * move, space drops, escape cancels. Every step is said in one live region.
 *
 * The order is optimistic: the dropped order shows at once, `onReorder`
 * saves it, and a rejection puts the old order back.
 */
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  applyIds,
  keyTarget,
  moveOnto,
  moveTo,
  sameIds,
  sortableText,
} from "./order";

export interface SortableMove {
  id: string;
  from: number;
  to: number;
}

export interface SortableListOptions<T extends { id: string }> {
  items: readonly T[];
  /** Save the new order (every id). A rejection restores the old order. */
  onReorder: (order: string[], move: SortableMove) => unknown;
  /** The spoken name of a row. */
  label?: (item: T) => string;
  /** `column` locks the drag to the vertical axis; `grid` does not. */
  axis?: "column" | "grid";
  /**
   * `handle`: a grip starts the drag at once (touch-action none on it).
   * `item`: the whole row is the handle; touch needs a short hold so a swipe
   * still scrolls.
   */
  grab?: "handle" | "item";
  disabled?: boolean;
  /** A save was rejected (the order is already back). */
  onError?: (error: unknown) => void;
}

/** A column drags up and down only. */
export const lockVertical: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

const SEP = "\u0000";

export function useSortableList<T extends { id: string }>(
  opts: SortableListOptions<T>
) {
  const { items, onReorder, label, axis = "column", grab = "handle" } = opts;
  const [pending, setPending] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const settled = useRef(false);
  const handles = useRef(new Map<string, HTMLElement>());
  const origin = useRef<string[] | null>(null);

  const ordered = useMemo(() => applyIds(items, pending), [items, pending]);
  const ids = useMemo(() => ordered.map((i) => i.id), [ordered]);
  const itemKey = items.map((i) => i.id).join(SEP);

  const live = useRef({
    ids,
    ordered,
    label,
    onReorder,
    onError: opts.onError,
    itemKey,
  });
  live.current = {
    ids,
    ordered,
    label,
    onReorder,
    onError: opts.onError,
    itemKey,
  };

  // The saved order caught up (or the server answered with its own): the
  // optimistic one is not needed any more.
  useEffect(() => {
    setPending((p) => {
      if (!p) return p;
      if (sameIds(p, itemKey ? itemKey.split(SEP) : [])) return null;
      return settled.current ? null : p;
    });
  }, [itemKey]);

  const name = useCallback((id: string) => {
    const it = live.current.ordered.find((x) => x.id === id);
    return it ? (live.current.label?.(it) ?? it.id) : id;
  }, []);
  const say = useCallback(
    (kind: "pickedUp" | "dropped" | "cancelled", id: string) => {
      const list = live.current.ids;
      setMessage(
        sortableText[kind](name(id), list.indexOf(id) + 1, list.length)
      );
    },
    [name]
  );

  const commit = useCallback(
    async (id: string, next: string[], from: string[]) => {
      if (sameIds(from, next)) return;
      const move = { id, from: from.indexOf(id), to: next.indexOf(id) };
      settled.current = false;
      setPending(next);
      try {
        await live.current.onReorder(next, move);
        settled.current = true;
      } catch (error) {
        setPending(null); // rollback
        setMessage(sortableText.failed);
        live.current.onError?.(error);
      }
    },
    []
  );

  /* ---- pointer and touch ---- */
  const pointer = useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  });
  const mouse = useSensor(MouseSensor, {
    activationConstraint: { distance: 4 },
  });
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: 220, tolerance: 6 },
  });
  const sensors = useSensors(...(grab === "item" ? [mouse, touch] : [pointer]));

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id);
      origin.current = live.current.ids;
      setActiveId(id);
      say("pickedUp", id);
    },
    [say]
  );
  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      if (!e.over) return;
      const id = String(e.active.id);
      const list = live.current.ids;
      const pos = moveOnto(list, id, String(e.over.id)).indexOf(id) + 1;
      setMessage(sortableText.moved(name(id), pos, list.length));
    },
    [name]
  );
  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      const id = String(e.active.id);
      const from = origin.current ?? live.current.ids;
      origin.current = null;
      if (!e.over || e.over.id === e.active.id) {
        if (e.over) say("dropped", id);
        return;
      }
      const next = moveOnto(from, id, String(e.over.id));
      setMessage(
        sortableText.dropped(name(id), next.indexOf(id) + 1, next.length)
      );
      void commit(id, next, from);
    },
    [commit, name, say]
  );
  const onDragCancel = useCallback(() => {
    const id = activeId;
    setActiveId(null);
    origin.current = null;
    if (id) say("cancelled", id);
  }, [activeId, say]);

  /* ---- keyboard ---- */
  const cancelLift = useCallback(
    (id: string) => {
      const from = origin.current;
      origin.current = null;
      setLifted(null);
      if (from) {
        const saved = live.current.itemKey.split(SEP);
        setPending(sameIds(from, saved) ? null : from);
      }
      const list = from ?? live.current.ids;
      setMessage(
        sortableText.cancelled(name(id), list.indexOf(id) + 1, list.length)
      );
    },
    [name]
  );

  const onHandleKeyDown = useCallback(
    (id: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
      if (opts.disabled || e.target !== e.currentTarget) return;
      const list = live.current.ids;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (lifted !== id) {
          origin.current = list;
          setLifted(id);
          say("pickedUp", id);
        } else {
          const from = origin.current ?? list;
          origin.current = null;
          setLifted(null);
          say("dropped", id);
          void commit(id, list, from);
        }
        return;
      }
      if (lifted !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // the dialog around the list stays open
        cancelLift(id);
        return;
      }
      if (e.key === "Tab") {
        cancelLift(id);
        return;
      }
      const to = keyTarget(e.key, list.indexOf(id), list.length);
      if (to == null) return;
      e.preventDefault();
      const next = moveTo(list, id, to);
      if (sameIds(next, list)) return;
      setPending(next);
      setMessage(sortableText.moved(name(id), to + 1, list.length));
    },
    [cancelLift, commit, lifted, name, opts.disabled, say]
  );

  // A moved node can lose focus; the lifted row keeps it.
  useEffect(() => {
    if (!lifted) return;
    const el = handles.current.get(lifted);
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  });

  // No text selection and a grabbing cursor everywhere while a drag runs.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("nx-sorting", activeId != null);
    return () => root.classList.remove("nx-sorting");
  }, [activeId]);

  const registerHandle = useCallback((id: string, el: HTMLElement | null) => {
    if (el) handles.current.set(id, el);
    else handles.current.delete(id);
  }, []);

  return {
    ordered,
    ids,
    activeId,
    lifted,
    message,
    axis,
    grab,
    sensors,
    collisionDetection: closestCenter,
    modifiers: axis === "column" ? [lockVertical] : [],
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
    onHandleKeyDown,
    registerHandle,
    disabled: !!opts.disabled,
  };
}

export type SortableController = ReturnType<typeof useSortableList>;
