"use client";

import { type ReactNode, useCallback } from "react";

import { laterPatch } from "@/lib/needt3/day";
import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Project, V3Task } from "@/lib/needt3/map";

import { isOverdue } from "../../work/model";
import { PkTaskRow, usePkExit } from "../kit";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { isAhead, projectOf } from "./model";
import { SAY } from "./strings";

const none = () => undefined;

/**
 * The rows both screens draw, with their exits (usePtkRows): swipe right or
 * the check = done, swipe left = tomorrow, a tap opens the task sheet.
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
}: {
  today: string;
  projects: readonly V3Project[];
  hideProject?: boolean;
}) {
  const update = useUpdateTask();
  const openTask = usePhoneOverlays((s) => s.openTask);

  const X = usePkExit<V3Task>((t, kind) => {
    if (kind === "later") {
      update
        .mutateAsync({ id: t.id, patch: laterPatch(t, today) })
        .then(({ undo }) => snack(SAY.tomorrow, undo), none);
    } else {
      // The hook has told the person and put the old fields back on a failure.
      update.mutateAsync({ id: t.id, patch: { done: true } }).catch(none);
    }
  });

  const reopen = useCallback(
    (t: V3Task) => {
      update.mutateAsync({ id: t.id, patch: { done: false } }).catch(none);
    },
    [update]
  );

  const row = (t: V3Task): ReactNode => {
    const p = hideProject ? null : projectOf(t.projectId, projects);
    return (
      <PkTaskRow
        key={t.id}
        t={t}
        project={p ? { name: p.name, color: p.color } : null}
        hideProject={hideProject}
        late={isOverdue(t, today)}
        phase={X.phase[t.id]}
        out={!!X.out[t.id]}
        canDone={!t.done}
        canLater={!t.done && !isAhead(t, today)}
        onCheck={(x) => (x.done ? reopen(x) : X.exit(x, "check"))}
        onOpen={openTask}
        onSwipe={(side) => X.exit(t, side)}
      />
    );
  };

  return { row, busy: X.phase };
}
