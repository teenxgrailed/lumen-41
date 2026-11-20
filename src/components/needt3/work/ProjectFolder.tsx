"use client";

import type { V3Project, V3Task } from "@/lib/needt3/map";
import { projectColor } from "@/lib/needt3/project-color";

import { Folder } from "../ui/Folder";
import { folderOpen, nextTasks, peekMeta } from "./model";

/** Project.icon is an emoji when it holds a pictograph (and not a glyph name). */
const isEmoji = (s: string) =>
  s.length <= 12 && /\p{Extended_Pictographic}/u.test(s);

/**
 * The folder's sticker: the project's emoji when `icon` is one, else the
 * first letter of its name, white on a solid circle in the project colour.
 * (//todo a glyph-name icon has no registry yet, so it takes the letter.)
 */
export function ProjectSticker({
  project: p,
}: {
  project: Pick<V3Project, "name" | "icon">;
}) {
  const icon = p.icon?.trim();
  if (icon && isEmoji(icon))
    return (
      <span className="nx-folder-sticker-emoji" data-sticker="emoji">
        {icon}
      </span>
    );
  const letter = Array.from(p.name.trim())[0] ?? "?";
  return (
    <span className="nx-folder-sticker-letter" data-sticker="letter">
      {letter}
    </span>
  );
}

/**
 * One project as a folder (behind `folders_v1`): the sheets are its next
 * three open tasks (title and status circle), soonest first, or one "No open
 * tasks" sheet; the count is its open tasks. The tasks are the ones the
 * screen already loaded, so no request is made here. A click opens the page.
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
  const open = folderOpen(p.id, tasks).length;
  const next = nextTasks(p.id, tasks, today);
  return (
    <Folder
      className="nx-swap"
      style={{ animationDelay: `${index * 40}ms` }}
      label={p.name}
      count={open}
      hue={projectColor(p.id, p.color)}
      sticker={<ProjectSticker project={p} />}
      peeks={
        next.length
          ? next.map((t) => ({
              key: t.id,
              title: t.title,
              meta: peekMeta(t, today),
            }))
          : [{ key: "none", title: "No open tasks", muted: true }]
      }
      href={`/projects/${encodeURIComponent(p.id)}`}
      ariaLabel={`Open ${p.name}, ${open} open`}
      extra={{ "data-ctx": "project", "data-ctx-id": p.id }}
    />
  );
}
