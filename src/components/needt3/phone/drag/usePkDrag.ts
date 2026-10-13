"use client";

import { useEffect, useRef, useState } from "react";

import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";

import { snack } from "../overlays/snack";
import { usePkToday } from "../overlays/today";
import { type DropRequest, type ZoneSpec, dropPatch } from "./drop";
import { type PdOptions, attachPkDrag } from "./lift";

export interface PkDragOptions {
  /** The zones by key (`<PkDropZone k>`): what a drop into each one means. */
  specs: Readonly<Record<string, ZoneSpec>>;
  /** The tasks the list shows, to read the rows around a gap. */
  tasks: readonly V3Task[];
  /** Ids that are mid-exit (swiped away): not liftable. */
  busy?: Readonly<Record<string, unknown>>;
}

/**
 * Hold a row to lift it, drop it on another section or between rows
 * (phone-drag.jsx). Put `ref` on the element that holds the zones:
 *
 *   const dz = usePkDrag({ specs, tasks });
 *   <div ref={dz.ref}> <PkDropZone k="Today" spec={specs.Today}>…</PkDropZone> </div>
 *
 * A drop writes the zone's day / hour / project through `useUpdateTask` and
 * says what happened with Undo (`notify`).
 */
export function usePkDrag({ specs, tasks, busy }: PkDragOptions) {
  const update = useUpdateTask();
  const today = usePkToday();
  const opts = useRef<PdOptions>({});
  opts.current = {
    canLift: (id) => {
      const t = tasks.find((x) => String(x.id) === id);
      return !!t && !t.done && !busy?.[t.id];
    },
    onDrop: (r: DropRequest) => {
      const w = dropPatch(r, specs, tasks, today);
      if (!w) return;
      update.mutateAsync({ id: w.id, patch: w.patch }).then(
        ({ undo }) => snack(w.say, undo),
        // The hook has told the person and put the old fields back.
        () => undefined
      );
    },
  };
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(
    () => (el ? attachPkDrag(el, () => opts.current) : undefined),
    [el]
  );
  return { ref: setEl };
}
