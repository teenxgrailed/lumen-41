"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  LuChevronLeft,
  LuEllipsis,
  LuPencil,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";

import { durLabel } from "@/lib/needt3/day";
import {
  useArchiveProject,
  useProjects,
  useUpdateProject,
} from "@/lib/needt3/hooks/projects";
import { useCreateTask, useTasks } from "@/lib/needt3/hooks/tasks";
import type { V3Project, V3Task } from "@/lib/needt3/map";

import { StScreen } from "../../states/StScreen";
import { projectHue, projectStats } from "../../work/model";
import { PkDropZone, usePkDrag } from "../drag";
import { PkButton, PkEmpty, PkNumber, PkScreen, PkSection } from "../kit";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { usePkToday } from "../overlays/today";
import { TaskParam } from "./TaskParam";
import {
  DONE_ZONE,
  deleteLine,
  deletedLabel,
  openInProjects,
  projectGroups,
  projectHits,
  projectRow,
  projectSpecs,
  taskHits,
} from "./model";
import {
  PtkActions,
  PtkBar,
  PtkEditSheet,
  PtkRing,
  PtkTile,
  cappedRows,
  useFolds,
  useMore,
} from "./parts";
import { SAY, copy } from "./strings";
import { useTaskRows } from "./useTaskRows";

const NO_TASKS: V3Task[] = [];
const NO_PROJECTS: V3Project[] = [];
const none = () => undefined;

/**
 * Projects on the phone (phone-tasks.jsx PtkProjects): calm rows on the
 * ground; a row opens the project's page at /projects/[id] (`projectId`).
 * Projects are made on the desktop for now, as the prototype says.
 */
export function PhoneProjects({
  projectId = null,
}: {
  projectId?: string | null;
}) {
  const projectsQ = useProjects();
  const tasksQ = useTasks();
  // Both feed the numbers: the first one without data decides the state.
  const query = projectsQ.data === undefined ? projectsQ : tasksQ;
  return (
    <StScreen query={query} screen="projects">
      <TaskParam />
      <ProjectsBody
        projects={projectsQ.data ?? NO_PROJECTS}
        tasks={tasksQ.data ?? NO_TASKS}
        projectId={projectId}
        loaded={projectsQ.isSuccess}
      />
    </StScreen>
  );
}

function ProjectsBody({
  projects,
  tasks,
  projectId,
  loaded,
}: {
  projects: V3Project[];
  tasks: V3Task[];
  projectId: string | null;
  loaded: boolean;
}) {
  const router = useRouter();
  const live = useMemo(() => tasks.filter((t) => !t.noSlot), [tasks]);
  const page = projectId
    ? (projects.find((p) => p.id === projectId) ?? null)
    : null;

  // A project that is gone (deleted elsewhere) goes back to the list.
  useEffect(() => {
    if (projectId && loaded && !page) router.replace("/projects");
  }, [projectId, loaded, page, router]);

  if (projectId) {
    if (!page) return null;
    return (
      <div key={`p-${page.id}`} className="ptk-stage">
        <ProjectPageView
          p={page}
          projects={projects}
          tasks={live}
          onBack={() => router.push("/projects")}
        />
      </div>
    );
  }
  return (
    <div key="list" className="ptk-stage">
      <ProjectList
        projects={projects}
        tasks={live}
        onPick={(id) => router.push(`/projects/${encodeURIComponent(id)}`)}
      />
    </div>
  );
}

/* ══ the list ═════════════════════════════════════════════════════════════ */

function ProjectRowView({
  p,
  tasks,
  onPick,
}: {
  p: V3Project;
  tasks: readonly V3Task[];
  onPick: (id: string) => void;
}) {
  const r = projectRow(p, tasks);
  return (
    <button
      type="button"
      className="ptk-prow"
      onClick={() => onPick(p.id)}
      data-ptk-project={p.id}
      aria-label={`${p.name}, ${r.open.length ? `${r.open.length} open` : r.meta}`}
    >
      <PtkTile p={p} />
      <span className="ptk-prow-main">
        <span className="ptk-prow-name">{p.name}</span>
        <span className="ptk-prow-meta">{r.meta}</span>
      </span>
      <span
        className="ptk-prow-ring"
        title={`${Math.round(r.pct * 100)}${copy.PtkProjectRow.done}`}
      >
        <PtkRing pct={r.pct} hue={projectHue(p)} />
      </span>
    </button>
  );
}

function ProjectList({
  projects,
  tasks,
  onPick,
}: {
  projects: V3Project[];
  tasks: V3Task[];
  onPick: (id: string) => void;
}) {
  const openN = openInProjects(tasks, projects);
  const c = copy.PtkProjects;
  const pull = {
    search: (q: string) => projectHits(projects, tasks, q),
    onPick: (hit: { id: string }) => onPick(hit.id),
    placeholder: c.search_projects,
    hint: c.projects_by_any_word_in_their_name,
  };
  return (
    <PkScreen
      screen="projects"
      title={c.projects}
      onPull={pull}
      sub={
        projects.length ? (
          <span className="ptk-sub">
            <span>
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </span>
            <span className="ptk-sub-sep">
              <PkNumber value={openN} label={String(openN)} /> open
            </span>
          </span>
        ) : null
      }
    >
      {projects.length ? (
        <div className="ptk-plist">
          {projects.map((p) => (
            <ProjectRowView key={p.id} p={p} tasks={tasks} onPick={onPick} />
          ))}
        </div>
      ) : (
        <PkEmpty line={c.no_projects_yet_projects_are_made_on_the} />
      )}
    </PkScreen>
  );
}

/* ══ a project's page ═════════════════════════════════════════════════════ */

function ProjectPageView({
  p,
  projects,
  tasks,
  onBack,
}: {
  p: V3Project;
  projects: V3Project[];
  tasks: V3Task[];
  onBack: () => void;
}) {
  const router = useRouter();
  const today = usePkToday();
  const hue = projectHue(p);
  const openTask = usePhoneOverlays((s) => s.openTask);
  const create = useCreateTask();
  const updateProject = useUpdateProject();
  const archive = useArchiveProject();
  const R = useTaskRows({ today, projects, hideProject: true });
  const { fold, flip } = useFolds();
  const more = useMore();
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  const mine = useMemo(
    () => tasks.filter((t) => t.projectId === p.id),
    [tasks, p.id]
  );
  const stats = projectStats(p.id, tasks, today);
  const { groups, done } = useMemo(
    () => projectGroups(p.id, tasks, today),
    [p.id, tasks, today]
  );
  const open = mine.filter((t) => !t.done);
  const left = open
    .filter((t) => !R.busy[t.id])
    .reduce((n, t) => n + (t.estimatedMinutes || 0), 0);
  const specs = useMemo(() => projectSpecs(today), [today]);
  const dz = usePkDrag({ specs, tasks: mine, busy: R.busy });

  /* Add: a task of this project with no day yet (WkProjectPage's rule). */
  const addTitle = (title: string) => {
    const text = title.trim();
    if (!text) return;
    create
      .mutateAsync({
        draft: {
          title: text,
          projectId: p.id,
          estimatedMinutes: 30,
          dueDate: null,
        },
      })
      .then(({ undo }) => snack(`Added to “${p.name}”`, undo), none);
  };
  const add = () => {
    if (!draft.trim()) return;
    addTitle(draft);
    setDraft("");
  };
  const del = () => {
    setMenu(false);
    router.push("/projects");
    archive
      .archive(p.id)
      .then(({ undo }) => snack(deletedLabel(p.name, open.length), undo), none);
  };
  const save = (v: { name: string; color: string }) => {
    setEditing(false);
    updateProject
      .mutateAsync({ id: p.id, patch: v })
      .then(({ undo }) => snack(SAY.saved, undo), none);
  };

  const pull = {
    search: (q: string) => taskHits(mine, q, today),
    onPick: (hit: { id: string }) => {
      const t = mine.find((x) => x.id === hit.id);
      if (t) openTask(t);
    },
    onAdd: addTitle,
    placeholder: `Search or add to ${p.name}`,
    hint: copy.PtkProjectPage.this_projects_tasks_by_any_word_enter_ad,
    addLabel: (q: string) => (q ? `Add “${q}”` : `Add to ${p.name}`),
  };

  const c = copy.PtkProjectPage;
  const head = (
    <div className="ptk-ph" data-ptk-page={p.id}>
      <PkButton
        kind="ghost"
        icon={<LuChevronLeft size={18} aria-hidden />}
        className="ptk-back"
        onClick={onBack}
        data-ptk-back
      >
        {c.projects}
      </PkButton>
      <div className="ptk-ph-row">
        <PtkTile p={p} big />
        <h1 className="pk-title ptk-ph-name">{p.name}</h1>
        <button
          type="button"
          className="ptk-round"
          aria-label={c.project_options}
          onClick={() => setMenu(true)}
          data-ptk-menu
        >
          <LuEllipsis size={20} aria-hidden />
        </button>
      </div>
      <p className="pk-sub ptk-sub">
        <span>
          <PkNumber value={open.length} label={String(open.length)} /> open
        </span>
        {left ? (
          <span className="ptk-sub-sep">{durLabel(left)} left</span>
        ) : !open.length && mine.length ? (
          <span className="ptk-sub-sep">{c.all_done}</span>
        ) : null}
        {stats.late ? (
          <span className="ptk-sub-sep ptk-sub-late">
            <span className="pk-alert-dot" />
            {stats.late} overdue
          </span>
        ) : null}
      </p>
      {mine.length ? <PtkBar pct={stats.pct} hue={hue} /> : null}
    </div>
  );

  const addLabel = `${c.add_a_task_to} ${p.name}`;
  return (
    <>
      <PkScreen
        screen="project"
        compactTitle={p.name}
        head={head}
        headClass="ptk-head is-page"
        onPull={pull}
      >
        <div className="ptk-add">
          <span className="ptk-add-plus" aria-hidden="true">
            <LuPlus size={18} />
          </span>
          <input
            className="ptk-add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={addLabel}
            aria-label={addLabel}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") {
                setDraft("");
                e.currentTarget.blur();
              }
            }}
            data-ptk-add
          />
          {draft.trim() ? (
            <PkButton
              kind="chip"
              className="ptk-add-go"
              onClick={add}
              data-ptk-add-go
            >
              {c.add}
            </PkButton>
          ) : null}
        </div>
        <div ref={dz.ref} className="ptk-zones">
          {groups.map((g) => (
            <PkDropZone
              key={g.key}
              k={g.key}
              spec={specs[g.key]}
              folded={!!fold[g.key]}
            >
              <PkSection
                title={g.title}
                tone={g.tone}
                count={g.tasks.length}
                folded={!!fold[g.key]}
                onFold={flip(g.key)}
              >
                {cappedRows(g.tasks, R.row, more.all(g.key), more.open(g.key))}
              </PkSection>
            </PkDropZone>
          ))}
          {done.length ? (
            <PkDropZone
              k={DONE_ZONE}
              spec={specs[DONE_ZONE]}
              folded={!!fold[DONE_ZONE]}
            >
              <PkSection
                title={c.done}
                count={done.length}
                folded={!!fold[DONE_ZONE]}
                onFold={flip(DONE_ZONE)}
              >
                {cappedRows(
                  done,
                  R.row,
                  more.all(DONE_ZONE),
                  more.open(DONE_ZONE)
                )}
              </PkSection>
            </PkDropZone>
          ) : null}
        </div>
        {!groups.length && !done.length ? (
          <PkEmpty line={c.nothing_in_this_project_yet_add_the_firs} />
        ) : null}
        {!groups.length && done.length ? (
          <PkEmpty line={c.all_done_here} />
        ) : null}
      </PkScreen>

      <PtkActions
        open={menu}
        onClose={() => setMenu(false)}
        title={p.name}
        items={[
          {
            id: "edit",
            icon: <LuPencil size={18} aria-hidden />,
            title: c.edit_project,
            line: c.name_and_colour,
            onClick: () => {
              setMenu(false);
              setEditing(true);
            },
          },
          {
            id: "delete",
            icon: <LuTrash2 size={18} aria-hidden />,
            title: c.delete_project,
            danger: true,
            line: deleteLine(open.length),
            onClick: del,
          },
        ]}
      />
      <PtkEditSheet
        open={editing}
        p={p}
        projects={projects}
        onClose={() => setEditing(false)}
        onSave={save}
      />
    </>
  );
}
