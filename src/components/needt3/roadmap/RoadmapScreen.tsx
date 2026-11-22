"use client";

import { useCallback, useEffect, useMemo } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LuChevronLeft } from "react-icons/lu";

import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { buildRoadmap } from "@/lib/needt3/roadmap";

import { TaskDialogHost } from "../dialogs/TaskDialog";
import { PkButton, PkScreen } from "../phone/kit";
import { TaskParam } from "../phone/tasks/TaskParam";
import { useDesignV3 } from "../root/V3Root";
import { usePhoneUi } from "../root/phone-ui-context";
import { StScreen } from "../states/StScreen";
import { projectHue } from "../work/model";
import { WkEmpty } from "../work/parts";
import { RoadmapMap, RoadmapSummary } from "./RoadmapMap";

const NO_TASKS: V3Task[] = [];
const NO_PROJECTS: V3Project[] = [];

/** `?task=<id>` opens the task over the map, as on every other screen. */
function useTaskParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = useCallback(
    (value: string | null) => {
      const next = new URLSearchParams(params?.toString() ?? "");
      if (value) next.set("task", value);
      else next.delete("task");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : (pathname ?? "/"), {
        scroll: false,
      });
    },
    [params, pathname, router]
  );
  return { taskId: params?.get("task") ?? null, set };
}

/**
 * Projects → a project → Roadmap (`/projects/[id]/roadmap`): the project's
 * tasks as a metro map, read-only. A station opens its task; everything is
 * edited where it always is (the task, its "waits on", its status).
 */
export function RoadmapScreen({ projectId }: { projectId: string }) {
  const v3 = useDesignV3();
  const phone = usePhoneUi() === "phone";
  const router = useRouter();
  const projectsQ = useProjects();
  const tasksQ = useTasks();
  const { taskId, set } = useTaskParam();

  const projects = projectsQ.data ?? NO_PROJECTS;
  const tasks = tasksQ.data ?? NO_TASKS;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const roadmap = useMemo(
    () => buildRoadmap(projectId, tasks),
    [projectId, tasks]
  );
  const back = `/projects/${encodeURIComponent(projectId)}`;

  // A project that is gone (deleted elsewhere) goes back to the list.
  useEffect(() => {
    if (projectsQ.isSuccess && !project) router.replace("/projects");
  }, [projectsQ.isSuccess, project, router]);

  if (!v3) return null;
  const query = projectsQ.data === undefined ? projectsQ : tasksQ;
  const hue = projectHue(project);
  const name = project?.name ?? "Project";

  const body = project ? (
    roadmap.stations.length ? (
      <>
        <RoadmapSummary roadmap={roadmap} />
        <RoadmapMap roadmap={roadmap} hue={hue} onOpen={set} />
      </>
    ) : (
      <WkEmpty
        art="task"
        title="No milestones yet"
        line="Every task of this project is a station. A task that waits on another draws the line between them."
        cta="Add a task"
        onClick={() => router.push(back)}
      />
    )
  ) : null;

  if (phone)
    return (
      <StScreen query={query} screen="projects">
        <TaskParam />
        <PkScreen
          screen="roadmap"
          head={
            <div className="ptk-ph rm-phone-head" data-rm-page={projectId}>
              <PkButton
                kind="ghost"
                icon={<LuChevronLeft size={18} aria-hidden />}
                className="ptk-back"
                onClick={() => router.push(back)}
                data-rm-back
              >
                {name}
              </PkButton>
              <h1 className="pk-title">Roadmap</h1>
            </div>
          }
          headClass="ptk-head is-page"
        >
          <div className="rm-page is-phone">{body}</div>
        </PkScreen>
      </StScreen>
    );

  return (
    <div className="wk-screen" data-rm-page={projectId}>
      <header className="wk-head">
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm wk-back"
          data-rm-back=""
          onClick={() => router.push(back)}
        >
          <LuChevronLeft size={15} aria-hidden />
          <span className="rm-back-name">{name}</span>
        </button>
      </header>
      <StScreen query={query} screen="projects">
        <div className="scroll-inner nx-swap wk-scroll">
          <div className="rm-page">
            <h1 className="wk-phero-name rm-heading">Roadmap</h1>
            {body}
          </div>
        </div>
      </StScreen>
      <TaskDialogHost taskId={taskId} onClose={() => set(null)} />
    </div>
  );
}
