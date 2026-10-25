"use client";

import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useQueryClient } from "@tanstack/react-query";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { findListItem } from "@/lib/needt3/hooks/core";
import {
  usePersonalBands,
  usePersonalBlocks,
  useUpdatePersonal,
} from "@/lib/needt3/hooks/personal";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useV3PortalContainer } from "../ctx/PortalScope";
import {
  type PersonalDropAsk,
  PersonalDropConfirm,
} from "../personal/PersonalDropConfirm";
import { dropPatch } from "./drop";
import {
  type BandGesture,
  PERSONAL_DRAG_PREFIX,
  bandGesturePatch,
  personalHitForPlacement,
} from "./personal-drop";
import {
  type DragProps,
  type DragState,
  type DropHandler,
  useDrag,
} from "./useDrag";
import {
  type ResizeProps,
  type ResizeRequest,
  usePersonalResize,
} from "./usePersonalResize";

const LOG_SOURCE = "Needt3DragHost";

export interface DragApi {
  drag: DragState | null;
  dragProps: DragProps;
  /** The bottom-edge handle of a personal time band. */
  resizeProps: ResizeProps;
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
  const personal = usePersonalBands();
  const blocks = usePersonalBlocks().data?.blocks;
  const updatePersonal = useUpdatePersonal();
  /* A drop into personal time, or a change to a whole repeat, waits for a yes. */
  const [asking, setAsking] = useState<{
    ask: PersonalDropAsk;
    run: () => void;
    /** Gives a pulled band its height back when the person says no. */
    back?: () => void;
  } | null>(null);

  /* Move or resize one personal block. A repeating block asks first, because
     the whole series changes. */
  const changeBlock = useCallback(
    (
      blockId: string,
      gesture: BandGesture,
      hours: number,
      back?: () => void
    ) => {
      const block = blocks?.find((b) => b.id === blockId);
      const patch = block ? bandGesturePatch(block, tz, gesture, hours) : null;
      if (!block || !patch) {
        back?.();
        return;
      }
      const write = () =>
        void updatePersonal(block, patch).then((saved) => {
          if (!saved) back?.();
        });
      if (block.rrule) {
        setAsking({
          ask: {
            series: {
              title: block.title,
              emoji: block.emoji ?? "",
              change: gesture,
            },
          },
          run: write,
          back,
        });
      } else write();
    },
    [blocks, tz, updatePersonal]
  );

  const onResize = useCallback(
    (request: ResizeRequest) =>
      changeBlock(
        request.blockId,
        "resize",
        request.deltaHours,
        request.revert
      ),
    [changeBlock]
  );
  const { resizeProps } = usePersonalResize(onResize);

  const onDrop = useCallback<DropHandler>(
    (item, over, _mode, grab) => {
      if (item.id.startsWith(PERSONAL_DRAG_PREFIX)) {
        // a personal band moves by how far the hand travelled on the grid
        if (over.kind === "timeline" && over.time != null && grab.time != null)
          changeBlock(
            item.id.slice(PERSONAL_DRAG_PREFIX.length),
            "move",
            over.time - grab.time
          );
        return;
      }
      const task = findListItem<V3Task>(qc, qk.tasks(), item.id);
      if (!task) return;
      const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
      const result = dropPatch(task, over, today);
      if (!result) return;
      const write = () =>
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
                {
                  error: error instanceof Error ? error.message : String(error),
                },
                LOG_SOURCE
              )
          );
      const band = personalHitForPlacement(
        personal,
        result.patch.scheduledStart,
        result.patch.scheduledEnd
      );
      if (band) setAsking({ ask: { taskTitle: task.title, band }, run: write });
      else write();
    },
    [qc, tz, mutateAsync, personal, changeBlock]
  );

  const { drag, dragProps } = useDrag(onDrop, container);
  const api = useMemo(
    () => ({ drag, dragProps, resizeProps }),
    [drag, dragProps, resizeProps]
  );
  return (
    <DragContext.Provider value={api}>
      {children}
      <PersonalDropConfirm
        ask={asking?.ask ?? null}
        onCancel={() => {
          asking?.back?.();
          setAsking(null);
        }}
        onConfirm={() => {
          const run = asking?.run;
          setAsking(null);
          run?.();
        }}
      />
    </DragContext.Provider>
  );
}
