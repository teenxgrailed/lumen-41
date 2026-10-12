"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LuChevronLeft, LuX } from "react-icons/lu";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  useArchiveProject,
  useCreateProject,
  useProjects,
  useUpdateProject,
} from "@/lib/needt3/hooks/projects";
import {
  useSetPref,
  useSettings,
  useTimeZone,
} from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { TaskDialogHost } from "../dialogs/TaskDialog";
import { PhoneProjects, PhoneTasks, phoneTab } from "../phone/tasks";
import { useDesignV3 } from "../root/V3Root";
import { usePhoneUi } from "../root/phone-ui-context";
import { StScreen } from "../states/StScreen";
import { Task } from "../task/Task";
import { MiniCard, ProjectCard } from "./ProjectCards";
import { ProjectPage } from "./ProjectPage";
import { ProjectSheet } from "./ProjectSheet";
import {
  NO_PROJECT,
  type ProjectFilter,
  WK_EMPTY,
  type WorkTab,
  isOverdue,
  projectHue,
  projectsSorted,
  readProjectSort,
  workModel,
} from "./model";
import { Capped, Fold, PageAddButton, Seg2, WkEmpty } from "./parts";
import { type WorkState, useWorkState } from "./useWorkState";

const EMPTY_TASKS: V3Task[] = [];
const EMPTY_PROJECTS: V3Project[] = [];

/** The task dialog opens over the current screen at `?task=<id>`. */
function useTaskParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );
  return { params, setParam };
}

/**
 * Tasks and Projects ($P/work.jsx WorkScreen): one component, two places.
 * Tasks = the Inbox / Today / Upcoming / All tabs over a row of project
 * cards that filter the list. Projects = the project cards (or one list),
 * and `/projects/[id]` = one project's page.
 */
export function WorkScreen({
  mode,
  projectId = null,
}: {
  mode: "tasks" | "projects";
  projectId?: string | null;
}) {
  const v3 = useDesignV3();
  const phone = usePhoneUi() === "phone";
  // One controller above the face switch: crossing 700 px swaps the faces and
  // must keep the tab, the folds, a typed line and an open edit sheet.
  const state = useWorkState(
    mode === "projects" ? "all" : phone ? phoneTab() : "today",
    projectId
  );
  if (!v3) return null;
  // The phone draws its own face (phone/tasks); this route stays mounted.
  if (phone)
    return mode === "tasks" ? (
      <PhoneTasks state={state} />
    ) : (
      <PhoneProjects projectId={projectId} state={state} />
    );
  return <WorkScreenContent mode={mode} projectId={projectId} state={state} />;
}

function WorkScreenContent({
  mode,
  projectId,
  state,
}: {
  mode: "tasks" | "projects";
  projectId: string | null;
  state: WorkState;
}) {
  const isProjects = mode === "projects";
  const router = useRouter();
  const tz = useTimeZone();
  const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const tasksQ = useTasks();
  const projectsQ = useProjects();
  const settings = useSettings();
  const setPref = useSetPref();
  const setComposerOpen = useNeedt3Ui((s) => s.setComposerOpen);
  const { params, setParam } = useTaskParam();

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const archiveProject = useArchiveProject();

  const { tab, setTab, fold, flip } = state;
  const [pf, setPf] = useState<ProjectFilter>(null);

  const prefs = settings.data?.prefs ?? {};
  const pview = prefs.projectsView === "list" ? "list" : "cards";
  const tasks = tasksQ.data ?? EMPTY_TASKS;
  const projects = useMemo(
    () =>
      projectsSorted(
        projectsQ.data ?? EMPTY_PROJECTS,
        readProjectSort(prefs.projectSort),
        tasks
      ),
    [projectsQ.data, prefs.projectSort, tasks]
  );
  const page = projectId
    ? (projects.find((p) => p.id === projectId) ?? null)
    : null;
  const editing = state.editId
    ? (projects.find((p) => p.id === state.editId) ?? null)
    : null;

  const sheetOpen = params.get("new") === "project" || !!editing;
  const openNew = () => setParam("new", "project");
  const closeSheet = () => {
    state.stopEdit();
    if (params.get("new")) setParam("new", null);
  };
  const openTask = (id: string) => setParam("task", id);

  const m = workModel({
    tasks,
    projects,
    today,
    tab,
    filter: pf,
    projectsOnly: isProjects,
  });
  const liveAll = tasks.filter((t) => !t.noSlot);
  const listOn = !isProjects || (pview === "list" && !projectId);

  // A project page whose project is gone (deleted elsewhere) goes back.
  useEffect(() => {
    if (projectId && projectsQ.isSuccess && !page) router.replace("/projects");
  }, [projectId, projectsQ.isSuccess, page, router]);

  const saveProject = (p: { name: string; color: string }) => {
    const target = editing;
    closeSheet();
    if (target) {
      void updateProject
        .mutateAsync({ id: target.id, patch: p })
        .then(({ undo }) =>
          notify.success(
            target.name === p.name
              ? "Project updated"
              : `Renamed to “${p.name}”`,
            { action: { label: "Undo", onClick: () => void undo() } }
          )
        )
        .catch(() => undefined);
      return;
    }
    if (isProjects) setTab("all");
    void createProject
      .mutateAsync({
        draft: { ...p, position: (projects.at(-1)?.position ?? 0) + 1 },
      })
      .then(({ undo }) =>
        notify.success(`Created “${p.name}”`, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };

  const deleteProject = (p: V3Project) => {
    const count = liveAll.filter((t) => t.projectId === p.id).length;
    router.push("/projects");
    //todo Archiving keeps the tasks' projectId (they drop out of every
    // project list but still point at it); the prototype moves them to No
    // project, which needs a bulk task route.
    void archiveProject
      .archive(p.id)
      .then(({ undo }) =>
        notify.success(
          `Archived “${p.name}”${count ? ` and its ${count} ${count === 1 ? "task" : "tasks"}` : ""}`,
          { action: { label: "Undo", onClick: () => void undo() } }
        )
      )
      .catch(() => undefined);
  };

  const row = (t: V3Task) => (
    <Task
      key={t.id}
      layout="row"
      task={t}
      today={today}
      late={isOverdue(t, today)}
      onOpen={openTask}
      hideProject={!!m.filter}
    />
  );
  const pick = (k: string) => () => setPf((v) => (v === k ? null : k));
  const noneTasks = liveAll.filter((t) => !t.projectId);
  const noneOpen = noneTasks.filter((t) => !t.done).length;
  const tabs: [WorkTab, string][] = [
    ["inbox", "Inbox"],
    ["today", "Today"],
    ["upcoming", "Upcoming"],
    ["all", "All Tasks"],
  ];
  const empty = WK_EMPTY[isProjects ? "projects" : tab];

  return (
    <div className="wk-screen">
      <header className="wk-head">
        {isProjects ? (
          <PageAddButton label="New project" onClick={openNew} />
        ) : (
          <PageAddButton
            label="New"
            items={[
              {
                art: "task",
                title: "New Task",
                sub: "Lands in Inbox",
                kbd: "N",
                onClick: () => setComposerOpen(true),
              },
              {
                art: "folder",
                title: "New Project",
                sub: "A folder with its own colour",
                onClick: openNew,
              },
            ]}
          />
        )}
        {projectId ? (
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm wk-back"
            data-wk-back=""
            onClick={() => router.push("/projects")}
          >
            <LuChevronLeft size={15} aria-hidden />
            Projects
          </button>
        ) : (
          <h1 className="wk-title">{isProjects ? "Projects" : "Tasks"}</h1>
        )}
        {isProjects && !projectId && projects.length ? (
          <span className="wk-pview" data-wk-pview={pview}>
            <Seg2
              value={pview}
              onChange={(v) => void setPref("projectsView", v)}
              options={[
                ["cards", "Cards"],
                ["list", "List"],
              ]}
            />
          </span>
        ) : null}
        {isProjects ? null : (
          <span className="wk-tabs">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`wk-tab wk-tabbtn${tab === id ? " is-on" : ""}`}
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
              >
                {label}
                {m.counts[id] ? (
                  <span className="wk-meta wk-num">{m.counts[id]}</span>
                ) : null}
              </button>
            ))}
          </span>
        )}
      </header>
      <ProjectSheet
        open={sheetOpen}
        onClose={closeSheet}
        onSave={saveProject}
        projects={projects}
        initial={editing}
        values={editing ? state.edit : null}
        onValues={state.setEdit}
        title={editing ? "Edit project" : undefined}
        cta={editing ? "Save" : undefined}
      />

      {isProjects ? null : (
        <div data-wk-cards="" className="wk-cards">
          {projects.map((p, i) => {
            const mine = liveAll.filter((t) => t.projectId === p.id);
            return (
              <MiniCard
                key={p.id}
                id={p.id}
                index={i}
                name={p.name}
                hue={projectHue(p)}
                open={mine.filter((t) => !t.done).length}
                total={mine.length}
                selected={m.filter === p.id}
                onPick={pick(p.id)}
              />
            );
          })}
          {noneOpen ? (
            <MiniCard
              id={NO_PROJECT}
              none
              index={projects.length}
              name="No project"
              hue="var(--text-muted)"
              open={noneOpen}
              total={noneTasks.length}
              selected={m.filter === NO_PROJECT}
              onPick={pick(NO_PROJECT)}
            />
          ) : null}
          {m.filter ? (
            <button
              type="button"
              data-wk-clear=""
              className="nx-btn nx-btn-text nx-btn-sm nx-swap wk-clear"
              onClick={() => setPf(null)}
            >
              <LuX size={13} aria-hidden />
              Clear filter
            </button>
          ) : null}
        </div>
      )}

      <StScreen query={tasksQ} screen={mode}>
        <div
          key={`${tab}-${isProjects ? `${pview}-${projectId ?? ""}` : ""}`}
          className="scroll-inner nx-swap wk-scroll"
        >
          {page ? (
            <ProjectPage
              key={page.id}
              project={page}
              tasks={liveAll}
              today={today}
              onOpenTask={openTask}
              onEdit={() => state.startEdit(page)}
              onDelete={() => deleteProject(page)}
              fold={state.pageFold}
              onFold={state.flipPage}
              draft={state.draft}
              onDraft={state.setDraft}
            />
          ) : null}
          {isProjects && !projectId && pview === "cards" && projects.length ? (
            <div className="wk-pgrid" data-wk-pgrid="">
              {projects.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  index={i}
                  tasks={m.live}
                  today={today}
                  onOpenTask={openTask}
                  onPick={(id) =>
                    router.push(`/projects/${encodeURIComponent(id)}`)
                  }
                />
              ))}
            </div>
          ) : null}
          {listOn
            ? m.sections.map((s) => (
                <Fold
                  key={s.key}
                  title={s.title}
                  tone={s.tone}
                  count={s.tasks.length}
                  open={!fold[s.key]}
                  onToggle={flip(s.key)}
                >
                  <div className="wk-list">
                    <Capped list={s.tasks} render={row} />
                  </div>
                </Fold>
              ))
            : null}
          {listOn && m.done.length ? (
            <Fold
              title="Done"
              count={m.done.length}
              open={!fold.__done}
              onToggle={flip("__done")}
            >
              <div data-wk-done="" className="wk-list">
                <Capped list={m.done} render={row} />
              </div>
            </Fold>
          ) : null}
          {projectId ||
          (isProjects &&
            pview === "cards" &&
            projects.length) ? null : isProjects && !projects.length ? (
            <WkEmpty
              art="folder"
              title="No projects yet"
              line="A project groups tasks and docs under one colour."
              cta="New project"
              onClick={openNew}
            />
          ) : !m.sections.length && !m.done.length ? (
            <WkEmpty
              art="task"
              title={empty[0]}
              line={empty[1]}
              cta="New task"
              onClick={() => setComposerOpen(true)}
            />
          ) : null}
        </div>
      </StScreen>
      <TaskDialogHost
        taskId={params.get("task")}
        onClose={() => setParam("task", null)}
      />
    </div>
  );
}
