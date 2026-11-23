"use client";

import { useNow } from "@/lib/needt3/hooks/clock";
import type { V3Project, V3Task } from "@/lib/needt3/map";

import { ProjectCard } from "./ProjectCards";
import { ProjectFolder } from "./ProjectFolder";

/**
 * The Projects grid. With `folders` (the `folders_v1` flag, read on the
 * server) every project is a folder; without it the grid is the old cards,
 * unchanged.
 */
export function ProjectsGrid({
  folders,
  projects,
  tasks,
  today,
  onOpenTask,
  onPick,
}: {
  folders: boolean;
  projects: readonly V3Project[];
  tasks: readonly V3Task[];
  today: string;
  onOpenTask: (id: string) => void;
  onPick: (id: string) => void;
}) {
  const now = useNow().getTime();
  return (
    <div className={`wk-pgrid${folders ? " is-folders" : ""}`} data-wk-pgrid="">
      {projects.map((p, i) =>
        folders ? (
          <ProjectFolder
            key={p.id}
            project={p}
            tasks={tasks}
            today={today}
            index={i}
            now={now}
          />
        ) : (
          <ProjectCard
            key={p.id}
            project={p}
            index={i}
            tasks={tasks}
            today={today}
            onOpenTask={onOpenTask}
            onPick={onPick}
          />
        )
      )}
    </div>
  );
}
