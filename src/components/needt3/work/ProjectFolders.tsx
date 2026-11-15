"use client";

import { LuFolder } from "react-icons/lu";

import type { V3Project, V3Task } from "@/lib/needt3/map";

import { Folder } from "../ui/Folder";
import { ProjectCard } from "./ProjectCards";
import { folderOpen, nextTasks, peekMeta, projectHue } from "./model";

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

/**
 * One project as a folder (behind `folders_v1`): the sheets are its next
 * three open tasks, soonest first, the count is its open tasks, the sticker
 * is the project's colour tile. The tasks are the ones the screen already
 * loaded, so no request is made here. A click opens the project's page.
 */
export function ProjectFolder({
  project: p,
  tasks,
  today,
  index = 0,
}: {
  project: V3Project;
  tasks: readonly V3Task[];
  today: string;
  index?: number;
}) {
  const hue = projectHue(p);
  const open = folderOpen(p.id, tasks).length;
  return (
    <Folder
      className="nx-swap"
      style={{ animationDelay: `${index * 40}ms` }}
      label={p.name}
      count={open}
      hue={hue}
      // //todo Project.icon names a glyph; until an icon map exists every
      // sticker draws the folder, like the project page and the phone tile.
      sticker={<LuFolder size={18} aria-hidden />}
      peeks={nextTasks(p.id, tasks, today).map((t) => ({
        key: t.id,
        title: t.title,
        meta: peekMeta(t, today),
      }))}
      href={`/projects/${encodeURIComponent(p.id)}`}
      ariaLabel={`Open ${p.name}, ${open} open`}
      extra={{ "data-ctx": "project", "data-ctx-id": p.id }}
    />
  );
}
