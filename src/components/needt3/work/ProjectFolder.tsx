"use client";

import { folderStyleOf } from "@/lib/needt3/folder-style";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { projectColor } from "@/lib/needt3/project-color";

import { type BrandId, brandIdForTaskProvider } from "../brand";
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

/** The project's mark for the looks that press a glyph into the folder. */
export function ProjectGlyph({
  project: p,
}: {
  project: Pick<V3Project, "name" | "icon">;
}) {
  const icon = p.icon?.trim();
  if (icon && isEmoji(icon))
    return (
      <span data-sticker="emoji" aria-hidden="true">
        {icon}
      </span>
    );
  return (
    <span data-sticker="letter" aria-hidden="true">
      {Array.from(p.name.trim())[0] ?? "?"}
    </span>
  );
}

/** The marks of the task apps a project is connected to (those we have a mark for). */
export function projectApps(p: Pick<V3Project, "connectedApps">): BrandId[] {
  const out: BrandId[] = [];
  for (const t of p.connectedApps ?? []) {
    const id = brandIdForTaskProvider(t);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
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
  now,
}: {
  project: V3Project;
  tasks: readonly V3Task[];
  today: string;
  index?: number;
  now?: number;
}) {
  const openTasks = folderOpen(p.id, tasks);
  const open = openTasks.length;
  const next = nextTasks(p.id, tasks, today);
  const apps = projectApps(p);
  const dueToday = openTasks.filter(
    (t) => peekMeta(t, today) === "Today"
  ).length;
  const stamp = p.updatedAt ? Date.parse(p.updatedAt) : NaN;
  return (
    <Folder
      className="nx-swap"
      style={{ animationDelay: `${index * 40}ms` }}
      label={p.name}
      count={open}
      unit="open"
      folderStyle={folderStyleOf(p.id, p.folderStyle)}
      glyph={<ProjectGlyph project={p} />}
      kind="project"
      apps={apps}
      statusLabel={
        dueToday > 0
          ? `${dueToday} due today`
          : apps.length
            ? "Synced"
            : undefined
      }
      updatedAt={Number.isNaN(stamp) ? null : stamp}
      now={now}
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
