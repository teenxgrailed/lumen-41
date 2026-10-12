import { z } from "zod";

import { OpError } from "../errors";
import {
  findScopedProject,
  iso,
  publishTasksUpdated,
  touched,
} from "../helpers";
import { defineOp } from "../types";

const projectId = z.string().min(1);

function projectView(project: {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  status: string;
  updatedAt: Date;
}) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    icon: project.icon,
    status: project.status,
    updatedAt: iso(project.updatedAt),
    href: `/projects/${project.id}`,
  };
}

export const projectCreate = defineOp({
  name: "project.create",
  description: "Create a project. Undo archives it.",
  risk: "reversible",
  input: z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(5000).optional(),
      color: z.string().max(32).optional(),
      icon: z.string().max(64).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const project = await ctx.tx.project.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        name: input.name,
        description: input.description,
        color: input.color,
        icon: input.icon,
      },
    });
    return {
      result: { project: projectView(project) },
      before: null,
      inverse: { op: "project.archive", input: { projectId: project.id } },
      touched: [touched("project", project)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const projectArchive = defineOp({
  name: "project.archive",
  description:
    "Archive a project. Its tasks stay as they are. Undo restores the previous status.",
  risk: "reversible",
  input: z.object({ projectId }).strict(),
  async run(ctx, input) {
    const project = await findScopedProject(ctx, input.projectId);
    if (project.status === "archived") {
      return { result: { project: projectView(project), changed: false } };
    }
    const updated = await ctx.tx.project.update({
      where: { id: project.id },
      data: { status: "archived" },
    });
    return {
      result: { project: projectView(updated), changed: true },
      before: { status: project.status },
      inverse: {
        op: "project.restore",
        input: { projectId: project.id, status: project.status },
      },
      touched: [touched("project", updated)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

/** Inverse-only: writes a project's previous status back. */
export const projectRestore = defineOp({
  name: "project.restore",
  description: "Write a stored project status back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z.object({ projectId, status: z.string().min(1) }).strict(),
  async run(ctx, input) {
    const project = await findScopedProject(ctx, input.projectId);
    if (!["active", "archived"].includes(input.status)) {
      throw new OpError("INVALID_INPUT", "Unknown project status");
    }
    const updated = await ctx.tx.project.update({
      where: { id: project.id },
      data: { status: input.status },
    });
    return {
      result: { project: projectView(updated) },
      before: { status: project.status },
      inverse: {
        op: "project.restore",
        input: { projectId: project.id, status: project.status },
      },
      touched: [touched("project", updated)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const projectOps = [projectCreate, projectArchive, projectRestore];
