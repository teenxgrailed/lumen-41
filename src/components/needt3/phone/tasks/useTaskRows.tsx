"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";

import { laterPatch } from "@/lib/needt3/day";
import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Project, V3Task } from "@/lib/needt3/map";

import { flowSteps } from "../../work/flow";
import { isOverdue } from "../../work/model";
import { PkTaskRow, usePkExit } from "../kit";
import { useTaskActions, useTrashWithUndo } from "../overlays/schedule";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { isAhead, projectOf } from "./model";
import { SAY } from "./strings";

const none = () => undefined;

type ExitKind = "check" | "done" | "later" | "trash";

/**
 * The rows both screens draw, with their exits (usePtkRows): swipe right or
 * the check = done, swipe left shows Schedule and Delete, a tap opens the task
 * sheet.
 *
 * A row leaves in steps (`usePkExit`: the check shows or the row is thrown off
 * the edge, then it folds shut) and only then is the change written, through
 * `useUpdateTask` (If-Match, optimistic, Undo). Ticking a done row reopens it
 * at once. `busy` holds the ids still leaving: the drag layer will not lift
 * them and the header does not count them.
 *
 * `hideProject` drops the project label inside a project's own page.
 */
export function useTaskRows({
  today,
  projects,
  hideProject,
  flow,
  blocked,
}: {
  today: string;
  projects: readonly V3Project[];
  hideProject?: boolean;
  /** The page draws the steps of its open tasks itself (a project's flow). */
  flow?: boolean;
  /** Tasks waiting on an open task: they cannot be moved a day. */
  blocked?: ReadonlySet<string>;
}) {
  const update = useUpdateTask();
  const trash = useTrashWithUndo();
  const openTask = usePhoneOverlays((s) => s.openTask);

  // Rows whose exit is playing and whose write has not gone out yet. The exit
  // is timers; if this face unmounts first (a swap to the desktop face, a
  // route change) the timers are dropped, so the write is made then instead of
  // being lost.
  const pending = useRef(new Map<string, { t: V3Task; kind: ExitKind }>());
  const write = (t: V3Task, kind: ExitKind) => {
    pending.current.delete(t.id);
    if (kind === "trash") {
      void trash(t);
    } else if (kind === "later") {
      update
        .mutateAsync({ id: t.id, patch: laterPatch(t, today) })
        .then(({ undo }) => snack(SAY.tomorrow, undo), none);
    } else {
      // The hook has told the person and put the old fields back on a failure.
      update.mutateAsync({ id: t.id, patch: { done: true } }).catch(none);
    }
  };
  const writeRef = useRef(write);
  writeRef.current = write;
  const X = usePkExit<V3Task>((t, kind) => writeRef.current(t, kind));
  useEffect(() => {
    const left = pending.current;
    return () => {
      for (const [, p] of [...left]) writeRef.current(p.t, p.kind);
    };
  }, []);
  const exit = (t: V3Task, kind: ExitKind) => {
    if (!pending.current.has(t.id)) pending.current.set(t.id, { t, kind });
    X.exit(t, kind);
  };

  const reopen = useCallback(
    (t: V3Task) => {
      update.mutateAsync({ id: t.id, patch: { done: false } }).catch(none);
    },
    [update]
  );

  const actionsOf = useTaskActions(exit);
  const row = (t: V3Task): ReactNode => {
    const p = hideProject ? null : projectOf(t.projectId, projects);
    return (
      <PkTaskRow
        key={t.id}
        t={t}
        project={p ? { name: p.name, color: p.color } : null}
        hideProject={hideProject}
        hideSteps={flow && !t.done && !!flowSteps(t)}
        late={isOverdue(t, today)}
        phase={X.phase[t.id]}
        out={!!X.out[t.id]}
        canDone={!t.done}
        canLater={!t.done && !isAhead(t, today) && !blocked?.has(t.id)}
        actions={t.done ? undefined : actionsOf(t)}
        onCheck={(x) => (x.done ? reopen(x) : exit(x, "check"))}
        onOpen={openTask}
        onSwipe={(side) => exit(t, side)}
      />
    );
  };

  return { row, busy: X.phase };
}
