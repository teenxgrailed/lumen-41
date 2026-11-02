import type { HubNote, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { findAgentByRef } from "./agents";
import { NOTE_SEARCH_MAX_LIMIT } from "./constants";
import type { HubScope, WorkspaceKey } from "./context";
import { actorAgentId } from "./context";
import { HubError } from "./errors";
import { agentNames } from "./items";
import { assertProjectInWorkspace, assertTaskInWorkspace } from "./links";
import {
  type NoteSearchInput,
  type NoteWriteInput,
  normalizeTags,
} from "./schemas";
import { assertNoSecrets } from "./secret-scan";

export function noteView(
  note: HubNote,
  names: Map<string, string>,
  untrusted: boolean
) {
  return {
    id: note.id,
    text: note.text,
    tags: note.tags,
    author:
      note.authorKind === "owner"
        ? { kind: "owner" }
        : {
            kind: "agent",
            id: note.authorAgentId,
            name:
              (note.authorAgentId && names.get(note.authorAgentId)) || "agent",
          },
    itemId: note.itemId,
    taskId: note.taskId,
    projectId: note.projectId,
    ownerEdited: note.ownerEdited,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    ...(untrusted ? { untrusted: true } : {}),
  };
}

async function viewNotes(
  key: WorkspaceKey,
  notes: HubNote[],
  untrusted: boolean
) {
  const names = await agentNames(
    key,
    notes.map((note) => note.authorAgentId)
  );
  return notes.map((note) => noteView(note, names, untrusted));
}

async function assertNoteLinks(
  key: WorkspaceKey,
  input: { itemId?: string; taskId?: string; projectId?: string }
) {
  if (input.itemId) {
    const item = await prisma.hubItem.findFirst({
      where: {
        id: input.itemId,
        userId: key.userId,
        workspaceId: key.workspaceId,
      },
      select: { id: true },
    });
    if (!item) {
      throw new HubError(
        "INVALID",
        `itemId ${input.itemId} is not an item in this workspace.`
      );
    }
  }
  if (input.taskId) await assertTaskInWorkspace(key, input.taskId);
  if (input.projectId) await assertProjectInWorkspace(key, input.projectId);
}

/**
 * Notes between agents. They are not the person's learned preferences
 * (`needt_remember`) and never reach Needt's own assistant.
 */
export async function writeNote(scope: HubScope, input: NoteWriteInput) {
  const text = input.text.trim();
  if (!text)
    throw new HubError("INVALID", "text cannot be empty.", { field: "text" });
  if (text.length > 2000) {
    throw new HubError("INVALID", "text is longer than 2000 characters.", {
      field: "text",
    });
  }
  assertNoSecrets({ text, tags: input.tags });
  const tags = normalizeTags(input.tags, 10);
  await assertNoteLinks(scope, input);
  const note = await prisma.hubNote.create({
    data: {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      text,
      tags,
      authorKind: scope.actor.kind,
      authorAgentId: actorAgentId(scope.actor),
      itemId: input.itemId ?? null,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
    },
  });
  return {
    note: (await viewNotes(scope, [note], scope.actor.kind === "agent"))[0],
  };
}

/**
 * Newest first, at most 25. A text query matches every word (case-insensitive);
 * tags must all be present.
 */
export async function searchNotes(
  scope: HubScope,
  input: NoteSearchInput & { all?: boolean }
) {
  const words = (input.query ?? "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 8);
  const tags = input.tags?.length ? normalizeTags(input.tags, 10) : [];
  let authorAgentId: string | undefined;
  if (input.authorAgent) {
    const agent = await findAgentByRef(scope, input.authorAgent);
    if (!agent) return { notes: [], untrusted: scope.actor.kind === "agent" };
    authorAgentId = agent.id;
  }
  const where: Prisma.HubNoteWhereInput = {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    ...(words.length
      ? {
          AND: words.map((word) => ({
            text: { contains: word, mode: "insensitive" as const },
          })),
        }
      : {}),
    ...(tags.length ? { tags: { hasEvery: tags } } : {}),
    ...(input.itemId ? { itemId: input.itemId } : {}),
    ...(authorAgentId ? { authorAgentId } : {}),
  };
  const take = Math.min(
    input.limit ?? 10,
    input.all ? 200 : NOTE_SEARCH_MAX_LIMIT
  );
  const notes = await prisma.hubNote.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take,
  });
  return {
    notes: await viewNotes(scope, notes, scope.actor.kind === "agent"),
    untrusted: scope.actor.kind === "agent",
  };
}

async function loadNote(scope: HubScope, id: string) {
  const note = await prisma.hubNote.findFirst({
    where: { id, userId: scope.userId, workspaceId: scope.workspaceId },
  });
  if (!note) throw new HubError("NOT_FOUND", "Note not found.");
  return note;
}

/**
 * The owner edits any note (it is then marked owner-edited). An agent may
 * change only its own note, and never one the owner has edited: it writes a
 * new note instead.
 */
export async function updateNote(
  scope: HubScope,
  id: string,
  input: { text?: string; tags?: string[] }
) {
  const note = await loadNote(scope, id);
  if (scope.actor.kind === "agent") {
    if (note.authorAgentId !== scope.actor.agent.id) {
      throw new HubError(
        "FORBIDDEN",
        "An agent can change only its own notes."
      );
    }
    if (note.ownerEdited) {
      throw new HubError(
        "FORBIDDEN",
        "The owner edited this note; write a new note instead of changing it."
      );
    }
  }
  const text = input.text?.trim();
  if (input.text !== undefined && (!text || text.length > 2000)) {
    throw new HubError("INVALID", "text must be 1 to 2000 characters.", {
      field: "text",
    });
  }
  assertNoSecrets({ text, tags: input.tags });
  const updated = await prisma.hubNote.update({
    where: { id },
    data: {
      ...(text !== undefined ? { text } : {}),
      ...(input.tags ? { tags: normalizeTags(input.tags, 10) } : {}),
      ...(scope.actor.kind === "owner" ? { ownerEdited: true } : {}),
    },
  });
  return {
    note: (await viewNotes(scope, [updated], scope.actor.kind === "agent"))[0],
  };
}

/** Only the owner deletes notes; nothing deletes them automatically. */
export async function deleteNote(scope: HubScope, id: string) {
  if (scope.actor.kind !== "owner") {
    throw new HubError("FORBIDDEN", "Only the owner can delete notes.");
  }
  await loadNote(scope, id);
  await prisma.hubNote.delete({ where: { id } });
  return { deleted: true };
}
