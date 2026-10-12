import type { SchedulingTaskPriority } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { parseTodoistRecurrence } from "@/lib/task-sync/recurrence/todoist-recurrence-converter";

import { addWarning } from "../apply";
import type {
  ImportPlan,
  ImportWarning,
  PlannedPart,
  PlannedProject,
  PlannedStage,
  PlannedTag,
  PlannedTask,
} from "../types";
import type {
  TodoistItem,
  TodoistNote,
  TodoistProject,
  TodoistSnapshot,
} from "./types";

/**
 * Todoist full sync → ImportPlan. Pure: no database, no clock beyond parsing
 * the dates Todoist sends.
 *
 * - project → Project (nesting flattened, the parent path goes into the
 *   description); the Inbox project is not a project in Needt, its tasks land
 *   in the Needt Inbox (no project)
 * - section → ProjectStage
 * - item → Task; first-level sub-task → TaskPart of its parent; deeper
 *   sub-tasks → separate tasks in the same project, noting their parent
 * - label → Tag (by name)
 * - comments → appended to the description with their date
 * - completed, archived and deleted objects, attachments and reminders are
 *   skipped and counted
 */

/** Todoist API priority 4 is the red "p1" flag; 1 is the default. */
export function mapTodoistPriority(priority: number): SchedulingTaskPriority {
  switch (priority) {
    case 4:
      return "URGENT";
    case 3:
      return "HIGH";
    case 2:
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = newDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function byOrder<T extends { child_order?: number | null }>(a: T, b: T) {
  return (a.child_order ?? 0) - (b.child_order ?? 0);
}

function commentsBlock(notes: TodoistNote[]): string | null {
  const lines = notes
    .filter((n) => n.content.trim())
    .sort((a, b) => (a.posted_at ?? "").localeCompare(b.posted_at ?? ""))
    .map((n) => {
      const day = n.posted_at ? n.posted_at.slice(0, 10) : null;
      return day ? `${day}: ${n.content.trim()}` : n.content.trim();
    });
  return lines.length ? `Comments from Todoist:\n${lines.join("\n")}` : null;
}

function joinBlocks(blocks: Array<string | null | undefined>): string | null {
  const kept = blocks.map((b) => b?.trim()).filter(Boolean);
  return kept.length ? kept.join("\n\n") : null;
}

export function planTodoistImport(snapshot: TodoistSnapshot): ImportPlan {
  const warnings: ImportWarning[] = [];
  let skipped = 0;

  /* ---------- projects ---------- */
  const allProjects = new Map(snapshot.projects.map((p) => [p.id, p]));
  const liveProject = (p: TodoistProject | undefined) =>
    !!p && !p.is_archived && !p.is_deleted;
  const inboxIds = new Set(
    snapshot.projects.filter((p) => p.inbox_project).map((p) => p.id)
  );

  function projectPath(p: TodoistProject): string[] {
    const path: string[] = [];
    const seen = new Set<string>();
    let parentId = p.parent_id;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = allProjects.get(parentId);
      if (!parent) break;
      path.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return path;
  }

  const projectNotes = new Map<string, TodoistNote[]>();
  for (const note of snapshot.project_notes) {
    if (note.is_deleted || !note.project_id) continue;
    if (note.file_attachment) {
      skipped += 1;
      addWarning(warnings, {
        code: "attachment_skipped",
        message: "A file attached to a project comment was not imported.",
        externalId: note.id,
      });
    }
    const list = projectNotes.get(note.project_id) ?? [];
    list.push(note);
    projectNotes.set(note.project_id, list);
  }

  const projects: PlannedProject[] = [];
  const importedProjectIds = new Set<string>();
  for (const p of [...snapshot.projects].sort(byOrder)) {
    if (inboxIds.has(p.id)) continue;
    if (!liveProject(p)) {
      skipped += 1;
      continue;
    }
    const path = projectPath(p);
    importedProjectIds.add(p.id);
    projects.push({
      externalId: p.id,
      name: p.name.trim() || "Untitled project",
      description: joinBlocks([
        path.length ? `In Todoist: ${[...path, p.name].join(" / ")}` : null,
        commentsBlock(projectNotes.get(p.id) ?? []),
      ]),
      position: projects.length,
      sourceUpdatedAt: parseDate(p.updated_at),
    });
  }

  /* ---------- sections ---------- */
  const stages: PlannedStage[] = [];
  const importedSectionIds = new Set<string>();
  const sortedSections = [...snapshot.sections].sort(
    (a, b) => (a.section_order ?? 0) - (b.section_order ?? 0)
  );
  for (const s of sortedSections) {
    if (s.is_archived || s.is_deleted) {
      skipped += 1;
      continue;
    }
    if (inboxIds.has(s.project_id)) {
      skipped += 1;
      addWarning(warnings, {
        code: "inbox_section_skipped",
        message: `Inbox section "${s.name}" has no project in Needt; its tasks went to the Inbox.`,
        externalId: s.id,
      });
      continue;
    }
    if (!importedProjectIds.has(s.project_id)) {
      skipped += 1;
      continue;
    }
    importedSectionIds.add(s.id);
    stages.push({
      externalId: s.id,
      projectExternalId: s.project_id,
      name: s.name.trim() || "Untitled section",
      position: s.section_order ?? stages.length,
      sourceUpdatedAt: parseDate(s.updated_at),
    });
  }

  /* ---------- labels ---------- */
  const tags: PlannedTag[] = [];
  const tagNames = new Set<string>();
  for (const label of snapshot.labels) {
    if (label.is_deleted) {
      skipped += 1;
      continue;
    }
    const name = label.name.trim();
    if (!name || tagNames.has(name)) continue;
    tagNames.add(name);
    tags.push({ externalId: label.id, name });
  }

  /* ---------- items ---------- */
  const itemNotes = new Map<string, TodoistNote[]>();
  for (const note of snapshot.notes) {
    if (note.is_deleted || !note.item_id) continue;
    if (note.file_attachment) {
      skipped += 1;
      addWarning(warnings, {
        code: "attachment_skipped",
        message: "A file attached to a task comment was not imported.",
        externalId: note.id,
      });
    }
    const list = itemNotes.get(note.item_id) ?? [];
    list.push(note);
    itemNotes.set(note.item_id, list);
  }

  const liveReminders = snapshot.reminders.filter((r) => !r.is_deleted);
  if (liveReminders.length) {
    skipped += liveReminders.length;
    addWarning(warnings, {
      code: "reminders_skipped",
      message: `${liveReminders.length} Todoist reminder(s) were not imported; Needt sets its own reminders.`,
    });
  }

  const items = new Map(snapshot.items.map((i) => [i.id, i]));
  const liveItem = (i: TodoistItem | undefined) =>
    !!i &&
    !i.checked &&
    !i.is_deleted &&
    (inboxIds.has(i.project_id) || importedProjectIds.has(i.project_id));

  /** How many live ancestors an item has (0 = top level). */
  function depth(item: TodoistItem): number {
    let d = 0;
    const seen = new Set<string>([item.id]);
    let parentId = item.parent_id;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = items.get(parentId);
      if (!liveItem(parent)) break;
      d += 1;
      parentId = parent!.parent_id;
    }
    return d;
  }

  function rootOf(item: TodoistItem): TodoistItem {
    let current = item;
    const seen = new Set<string>([item.id]);
    while (current.parent_id && !seen.has(current.parent_id)) {
      const parent = items.get(current.parent_id);
      if (!liveItem(parent)) break;
      seen.add(parent!.id);
      current = parent!;
    }
    return current;
  }

  const tasks: PlannedTask[] = [];
  const parts: PlannedPart[] = [];
  for (const item of [...snapshot.items].sort(byOrder)) {
    if (!liveItem(item)) {
      skipped += 1;
      continue;
    }
    const level = depth(item);
    const notes = itemNotes.get(item.id) ?? [];

    if (level === 1) {
      parts.push({
        externalId: item.id,
        taskExternalId: item.parent_id!,
        title: item.content.trim() || "Untitled",
        position: item.child_order ?? parts.length,
        sourceUpdatedAt: parseDate(item.updated_at),
      });
      if (
        item.description?.trim() ||
        item.due ||
        item.labels.length ||
        notes.some((n) => n.content.trim())
      ) {
        addWarning(warnings, {
          code: "subtask_details_dropped",
          message: `Sub-task "${item.content}" became a part of its task; its description, date, labels and comments were not kept.`,
          externalId: item.id,
        });
      }
      continue;
    }

    const root = level > 1 ? rootOf(item) : item;
    const directParent = level > 1 ? items.get(item.parent_id!) : undefined;

    const recurrenceText = item.due?.is_recurring ? item.due.string : null;
    const recurrenceRule = recurrenceText
      ? parseTodoistRecurrence(recurrenceText)
      : null;
    if (recurrenceText && !recurrenceRule) {
      addWarning(warnings, {
        code: "recurrence_unsupported",
        message: `"${item.content}" repeats "${recurrenceText}" in Todoist, which Needt could not read; it was imported without repeating.`,
        externalId: item.id,
      });
    }

    let estimatedMinutes: number | null = null;
    if (item.duration?.unit === "minute") {
      estimatedMinutes = Math.round(item.duration.amount);
    } else if (item.duration?.unit === "day") {
      addWarning(warnings, {
        code: "duration_days_skipped",
        message: `"${item.content}" has a duration in days, which Needt does not estimate in; it was left without an estimate.`,
        externalId: item.id,
      });
    }

    for (const name of item.labels) {
      const clean = name.trim();
      if (clean && !tagNames.has(clean)) {
        // A shared label: in the item, not in this person's label list.
        tagNames.add(clean);
        tags.push({ externalId: `name:${clean}`, name: clean });
      }
    }

    const projectExternalId = inboxIds.has(item.project_id)
      ? null
      : item.project_id;
    const sectionId = root.section_id;
    tasks.push({
      externalId: item.id,
      title: item.content.trim() || "Untitled",
      description: joinBlocks([
        directParent ? `Sub-task of "${directParent.content}"` : null,
        item.description,
        recurrenceText && !recurrenceRule
          ? `Repeats in Todoist: ${recurrenceText}`
          : null,
        commentsBlock(notes),
      ]),
      projectExternalId,
      stageExternalId:
        projectExternalId && sectionId && importedSectionIds.has(sectionId)
          ? sectionId
          : null,
      dueDate: parseDate(item.due?.date),
      deadline: parseDate(item.deadline?.date),
      estimatedMinutes,
      priorityLevel: mapTodoistPriority(item.priority),
      recurrenceRule,
      tagNames: item.labels.map((l) => l.trim()).filter(Boolean),
      sourceUpdatedAt: parseDate(item.updated_at),
    });
  }

  return { projects, stages, tags, tasks, parts, skipped, warnings };
}
