import { privateTreePageIds } from "@/services/pages/ai-page-access";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { WorkspaceKey } from "./context";
import { HubError } from "./errors";
import type { HubLinkInput } from "./schemas";

/** A task, project or page reference must sit in the hub's workspace. */
export async function assertTaskInWorkspace(key: WorkspaceKey, id: string) {
  const task = await prisma.task.findFirst({
    where: { id, workspaceId: key.workspaceId, trashedAt: null },
    select: { id: true },
  });
  if (!task) {
    throw new HubError(
      "INVALID",
      `taskId ${id} is not a task in this workspace.`
    );
  }
}

export async function assertProjectInWorkspace(key: WorkspaceKey, id: string) {
  const project = await prisma.project.findFirst({
    where: { id, workspaceId: key.workspaceId },
    select: { id: true },
  });
  if (!project) {
    throw new HubError(
      "INVALID",
      `projectId ${id} is not a project in this workspace.`
    );
  }
}

/**
 * A page link is refused when the page is missing, in another workspace, or
 * in a private tree: private pages never appear in any hub response, even as
 * a bare id.
 */
export async function assertPageLinkable(key: WorkspaceKey, id: string) {
  const page = await prisma.page.findFirst({
    where: { id, workspaceId: key.workspaceId },
    select: { id: true },
  });
  const blocked = page ? await privateTreePageIds([id]) : new Set<string>();
  if (!page || blocked.has(id)) {
    throw new HubError(
      "INVALID",
      `Page ${id} was not found, or it is private. Private pages are never available to AI.`
    );
  }
}

export function assertHttpUrl(field: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HubError(
      "INVALID",
      `${field}: "${value.slice(0, 60)}" is not a URL.`
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HubError(
      "INVALID",
      `${field}: only http and https links are allowed.`
    );
  }
  return url.toString();
}

/**
 * Validates links and returns the JSON stored on the item: external links as
 * `{label, url}`, Needt objects as `{type, id}`.
 */
export async function normalizeLinks(
  key: WorkspaceKey,
  links: readonly HubLinkInput[] | undefined,
  field = "links"
): Promise<Prisma.InputJsonValue> {
  const out: Prisma.InputJsonObject[] = [];
  for (const link of links ?? []) {
    if ("url" in link) {
      out.push({
        label: link.label.trim(),
        url: assertHttpUrl(field, link.url),
      });
    } else {
      if (link.type === "task") await assertTaskInWorkspace(key, link.id);
      else if (link.type === "project") {
        await assertProjectInWorkspace(key, link.id);
      } else await assertPageLinkable(key, link.id);
      out.push({ type: link.type, id: link.id });
    }
  }
  return out;
}
