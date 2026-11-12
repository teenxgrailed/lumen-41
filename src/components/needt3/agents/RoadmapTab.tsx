"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { buildRoadmap } from "@/lib/needt3/roadmap";

import { TaskDialogHost } from "../dialogs/TaskDialog";
import { usePhoneOverlays } from "../phone/overlays/store";
import { RoadmapMap, RoadmapSummary } from "../roadmap/RoadmapMap";
import { usePhoneUi } from "../root/phone-ui-context";
import { projectHue } from "../work/model";
import { AgBtn, AgEmpty } from "./AgParts";
import type { HubItemRow } from "./TasksTab";
import { hubForRoadmap, roadmapProjects } from "./roadmap-data";

const NO_TASKS: V3Task[] = [];
const NO_PROJECTS: V3Project[] = [];

/**
 * Agents → Roadmap: the same map as Projects → Roadmap, for the person who
 * runs work through agents. Each milestone shows the agent on its linked hub
 * item and how that item stands; a station opens its task. The roadmap is
 * changed by talking to the assistant in Chat (it moves tasks and their
 * waits through the same API), never by a second editor here.
 */
export function RoadmapTab({
  items,
  onOpenChat,
}: {
  items: readonly HubItemRow[];
  onOpenChat: () => void;
}) {
  const phone = usePhoneUi() === "phone";
  const openPhoneTask = usePhoneOverlays((s) => s.openTask);
  const projectsQ = useProjects();
  const tasksQ = useTasks();
  const projects = projectsQ.data ?? NO_PROJECTS;
  const tasks = tasksQ.data ?? NO_TASKS;
  const choices = useMemo(
    () => roadmapProjects(projects, tasks, items),
    [projects, tasks, items]
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const project = choices.find((p) => p.id === picked) ?? choices[0] ?? null;
  const hub = useMemo(() => hubForRoadmap(items), [items]);
  const roadmap = useMemo(
    () => (project ? buildRoadmap(project.id, tasks, hub) : null),
    [project, tasks, hub]
  );

  const open = (id: string) => (phone ? openPhoneTask(id) : setTaskId(id));

  if (projectsQ.isError || tasksQ.isError)
    return (
      <AgEmpty
        art="folder"
        title="Could not load your projects"
        line="The roadmap is drawn from your projects and tasks."
        action={
          <AgBtn
            onClick={() => {
              void projectsQ.refetch();
              void tasksQ.refetch();
            }}
          >
            Try again
          </AgBtn>
        }
      />
    );
  if (!projectsQ.data || !tasksQ.data)
    return (
      <div
        className="rm-loading"
        role="status"
        aria-busy="true"
        aria-label="Loading roadmap"
      />
    );

  if (!project || !roadmap)
    return (
      <AgEmpty
        art="folder"
        title="No roadmap yet"
        line="A project's tasks are its milestones. Ask in Chat to plan one, or add tasks to a project."
        action={<AgBtn onClick={onOpenChat}>Plan in Chat</AgBtn>}
      />
    );

  return (
    <div className="rm-agents" data-rm-agents={project.id}>
      {choices.length > 1 ? (
        <div className="ag-bar rm-pick" role="group" aria-label="Project">
          {choices.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ag-chip"
              aria-pressed={p.id === project.id}
              data-rm-project={p.id}
              onClick={() => setPicked(p.id)}
            >
              <span
                className="ag-dotc"
                aria-hidden="true"
                style={{ background: projectHue(p) }}
              />
              {p.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ag-glass rm-card">
        <div className="rm-card-head">
          <h2 className="rm-card-title">{project.name}</h2>
          <span className="rm-card-actions">
            <AgBtn tone="text" onClick={onOpenChat}>
              Change in Chat
            </AgBtn>
            <Link
              className="nx-btn nx-btn-sm nx-btn-text"
              href={`/projects/${encodeURIComponent(project.id)}/roadmap`}
            >
              Open in Projects
            </Link>
          </span>
        </div>
        <RoadmapSummary roadmap={roadmap} />
        <RoadmapMap
          roadmap={roadmap}
          hue={projectHue(project)}
          onOpen={open}
          agents
        />
      </div>
      {phone ? null : (
        <TaskDialogHost taskId={taskId} onClose={() => setTaskId(null)} />
      )}
    </div>
  );
}
