"use client";

import { useMemo } from "react";

import {
  addedLabel,
  createDraft,
  durLabel,
  moveOverdue,
} from "@/lib/needt3/day";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import {
  useCreateTask,
  useTasks,
  useUpdateTask,
} from "@/lib/needt3/hooks/tasks";
import type { V3Project, V3Task } from "@/lib/needt3/map";

import {
  StarterGameSlot,
  useStarterGameCard,
} from "../../starter-game/StarterGameSlot";
import { StScreen } from "../../states/StScreen";
import type { WorkState } from "../../work/useWorkState";
import { PkDropZone, usePkDrag } from "../drag";
import { PkButton, PkEmpty, PkNumber, PkScreen, PkSection, pkCx } from "../kit";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { usePkToday } from "../overlays/today";
import { TaskParam } from "./TaskParam";
import {
  DONE_FOLD,
  DONE_ZONE,
  PTK_TABS,
  type PtkTab,
  movedToTodayLabel,
  ptkHeader,
  ptkModel,
  ptkSpecs,
  taskHits,
} from "./model";
import { PtkBar, cappedRows } from "./parts";
import { EMPTY, copy } from "./strings";
import { useTaskRows } from "./useTaskRows";

const NO_TASKS: V3Task[] = [];
const NO_PROJECTS: V3Project[] = [];
const none = () => undefined;

/**
 * The tab the person was on last, kept while the app stays open and seeded
 * into `useWorkState` when the Tasks route opens on the phone. The live tab is
 * the shared state's (it survives a face swap); this only remembers it across
 * visits.
 */
let lastTab: PtkTab = "today";
export const phoneTab = (): PtkTab => lastTab;

/**
 * Tasks on the phone (phone-tasks.jsx PtkTasks): a compact segmented control
 * (Inbox · Today · Upcoming · All, open counts), one header line ("Done 3 of
 * 9 · 2 h 50 left") over a thin bar, the tab's sections as PkSection (each
 * folds; Done is one fold at the bottom, shut), PkTaskRow everywhere. Pull
 * down = search / add to today. Hold a row to lift it and drop it in another
 * section (the day, the project or the time is the data: `dropPatch`).
 *
 * Data: `useTasks` / `useProjects`; the loading, offline and error states are
 * the states layer's (`StScreen`).
 */
export function PhoneTasks({ state }: { state: WorkState }) {
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  return (
    <StScreen query={tasksQ} screen="tasks">
      <TaskParam />
      <TasksBody
        state={state}
        tasks={tasksQ.data ?? NO_TASKS}
        projects={projectsQ.data ?? NO_PROJECTS}
      />
    </StScreen>
  );
}

function TasksBody({
  state,
  tasks,
  projects,
}: {
  state: WorkState;
  tasks: V3Task[];
  projects: V3Project[];
}) {
  const today = usePkToday();
  // The four tabs are the desktop's tabs too, so the shared tab always fits.
  const tab = state.tab as PtkTab;
  const setTab = (id: PtkTab) => {
    lastTab = id;
    state.setTab(id);
  };
  const { fold, flip } = state;
  const openTask = usePhoneOverlays((s) => s.openTask);
  const update = useUpdateTask();
  const create = useCreateTask();

  const R = useTaskRows({ today, projects });
  const taskView = useTaskView();
  const m = useMemo(
    () => ptkModel({ tasks, projects, today, tab, view: taskView }),
    [tasks, projects, today, tab, taskView]
  );
  const specs = useMemo(
    () => ptkSpecs(tab, m.sections, projects, today),
    [tab, m.sections, projects, today]
  );
  const dz = usePkDrag({ specs, tasks: m.live, busy: R.busy });
  const h = ptkHeader(m.scope, today, R.busy);

  /* The header: one compact line for the tab, never the hero. */
  const left = h.mins ? `${durLabel(h.mins)} left` : null;
  const sub = (
    <span className="ptk-sub" data-ptk-count={`${h.doneN}/${h.total}`}>
      {h.total ? (
        <span>
          Done <PkNumber value={h.doneN} label={String(h.doneN)} /> of{" "}
          <PkNumber value={h.total} label={String(h.total)} />
        </span>
      ) : (
        <span>
          <PkNumber value={h.openN} label={String(h.openN)} /> open
        </span>
      )}
      {left ? <span className="ptk-sub-sep">{left}</span> : null}
      {h.late && tab !== "upcoming" ? (
        <span className="ptk-sub-sep ptk-sub-late">
          <span className="pk-alert-dot" />
          {h.late} overdue
        </span>
      ) : null}
    </span>
  );
  const head = (
    <>
      <PtkBar pct={h.total ? h.doneN / h.total : 0} />
      <div
        className="ptk-seg"
        role="tablist"
        aria-label={copy.PtkTasks.which_tasks}
      >
        {PTK_TABS.map(([id, label]) => {
          const n = m.counts[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={pkCx("ptk-seg-btn", tab === id && "is-on")}
              onClick={() => setTab(id)}
              data-ptk-tab={id}
            >
              <span>{label}</span>
              {n ? (
                <span className="ptk-seg-n">{n > 99 ? "99+" : n}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );

  /* Pull down: search a title, open it, or Enter adds to today. */
  const addToday = (title: string) => {
    const text = title.trim();
    if (!text) return;
    create
      .mutateAsync({ draft: createDraft({ title: text }, today) })
      .then(({ result, undo }) =>
        snack(addedLabel(result ?? { dueDate: today }, today), undo)
      )
      .catch(none);
  };
  const pull = {
    search: (q: string) => taskHits(m.live, q, today),
    onPick: (hit: { id: string }) => {
      const t = m.live.find((x) => x.id === hit.id);
      if (t) openTask(t);
    },
    onAdd: addToday,
  };

  /* Overdue → today, one write per task; the snack and its one Undo cover the
     moves that landed (a 409 on one row leaves that row, and only that row,
     where it was). */
  const moveToToday = () => {
    const r = moveOverdue(m.live, today);
    if (!r) return;
    void Promise.allSettled(
      r.moves.map((mv) => update.mutateAsync({ id: mv.id, patch: mv.patch }))
    ).then((results) => {
      const done = results.flatMap((x) =>
        x.status === "fulfilled" ? [x.value] : []
      );
      // The hook has told the person about each failure and put its row back.
      if (!done.length) return;
      snack(movedToTodayLabel(done.length), () =>
        Promise.allSettled(done.map((d) => d.undo()))
      );
    });
  };

  const empty = !m.live.length ? EMPTY.all : EMPTY[tab];
  const starter = useStarterGameCard();
  return (
    <PkScreen
      screen="tasks"
      title={copy.PtkTasks.tasks}
      sub={sub}
      head={head}
      headClass="ptk-head"
      onPull={pull}
    >
      <div key={tab} ref={dz.ref} className="ptk-swap" data-ptk-view={tab}>
        {m.sections.map((s) => (
          <PkDropZone
            key={s.key}
            k={s.key}
            spec={specs[s.key]}
            folded={!!fold[s.key]}
          >
            <PkSection
              title={s.title}
              tone={s.tone}
              count={s.tasks.length}
              folded={!!fold[s.key]}
              onFold={flip(s.key)}
              action={
                s.key === "overdue" ? (
                  <PkButton kind="chip" onClick={moveToToday}>
                    {copy.PtkTasks.move_to_today}
                  </PkButton>
                ) : null
              }
            >
              {cappedRows(
                s.tasks,
                R.row,
                !!state.more[s.key],
                state.openMore(s.key)
              )}
            </PkSection>
          </PkDropZone>
        ))}
        <StarterGameSlot screen="tasks" />
        {!m.sections.length && !starter.show && !starter.hold ? (
          <PkEmpty line={empty} />
        ) : null}
        {m.done.length ? (
          <PkDropZone
            k={DONE_ZONE}
            spec={specs[DONE_ZONE]}
            folded={!!fold[DONE_FOLD]}
          >
            <PkSection
              title={copy.PtkTasks.done}
              count={m.done.length}
              folded={!!fold[DONE_FOLD]}
              onFold={flip(DONE_FOLD)}
            >
              {cappedRows(
                m.done,
                R.row,
                !!state.more[DONE_FOLD],
                state.openMore(DONE_FOLD)
              )}
            </PkSection>
          </PkDropZone>
        ) : null}
      </div>
    </PkScreen>
  );
}
