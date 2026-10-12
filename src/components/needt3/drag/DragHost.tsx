"use client";

import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

import { useQueryClient } from "@tanstack/react-query";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { findListItem } from "@/lib/needt3/hooks/core";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { dropPatch } from "./drop";
import {
  type DragProps,
  type DragState,
  type DropHandler,
  useDrag,
} from "./useDrag";

const LOG_SOURCE = "Needt3DragHost";

export interface DragApi {
  drag: DragState | null;
  dragProps: DragProps;
}

const DragContext = createContext<DragApi | null>(null);

/** The drag host above this component, or null when none is mounted. */
export function useV3Drag() {
  return useContext(DragContext);
}

/**
 * One drag layer: hands the gesture to `useDrag` and turns a drop on a task
 * into a write — the time slot, the day or the project the hand let go over
 * (App.jsx's handler, `dropPatch`), with an Undo toast.
 *
 * The prototype mounts this once in the shell (App.jsx `useDrag`); until the
 * shell (S2) hoists it there, the calendar mounts its own.
 */
export function V3DragProvider({ children }: PropsWithChildren) {
  const qc = useQueryClient();
  const tz = useTimeZone();
  const update = useUpdateTask();
  const container = useV3PortalContainer();
  const { mutateAsync } = update;

  const onDrop = useCallback<DropHandler>(
    (item, over) => {
      const task = findListItem<V3Task>(qc, qk.tasks(), item.id);
      if (!task) return;
      const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
      const result = dropPatch(task, over, today);
      if (!result) return;
      void mutateAsync({ id: task.id, patch: result.patch })
        .then(({ undo }) =>
          notify.success(result.message, {
            action: { label: "Undo", onClick: () => void undo() },
          })
        )
        .catch(
          (error: unknown) =>
            void logger.warn(
              "Drop was not saved",
              { error: error instanceof Error ? error.message : String(error) },
              LOG_SOURCE
            )
        );
    },
    [qc, tz, mutateAsync]
  );

  const { drag, dragProps } = useDrag(onDrop, container);
  const api = useMemo(() => ({ drag, dragProps }), [drag, dragProps]);
  return <DragContext.Provider value={api}>{children}</DragContext.Provider>;
}
