/**
 * Plan 11 T-1: a task's counter. `0/3` is three unnamed parts (TaskPart rows
 * with an empty title); there is no counter column. Setting the count keeps
 * the existing rows in order, ticks the first `done` of them, removes rows
 * past `target` and appends new ones, so a part keeps its id across a change.
 *
 * A task with named parts is not a counter and is refused: a count would
 * otherwise mix steps someone wrote with steps nobody did.
 */
import { z } from "zod";

import { COUNT_MAX } from "@/lib/needt3/progress";
import { prisma } from "@/lib/prisma";

import { partSelect } from "./parts-waits";

export const countSchema = z
  .object({
    target: z.number().int().min(0).max(COUNT_MAX),
    done: z.number().int().min(0).max(COUNT_MAX).optional(),
  })
  .strict()
  .refine((v) => v.done === undefined || v.done <= v.target, {
    message: "done cannot be more than target",
    path: ["done"],
  });

export type CountInput = z.infer<typeof countSchema>;

export type CountResult =
  | { ok: true; target: number; done: number; parts: CountPart[] }
  | { ok: false; error: "NAMED_PARTS" };

type CountPart = { id: string; title: string; done: boolean; position: number };

const STEP = 1024;

export async function setTaskCount(
  taskId: string,
  input: CountInput
): Promise<CountResult> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.taskPart.findMany({
      where: { taskId },
      orderBy: { position: "asc" },
      select: partSelect,
    });
    if (rows.some((p) => p.title.trim()))
      return { ok: false as const, error: "NAMED_PARTS" as const };
    const target = input.target;
    // Without `done`, the ticks already made stay, as far as the new size allows.
    const done = Math.min(
      target,
      input.done ?? rows.filter((p) => p.done).length
    );
    const extra = rows.slice(target);
    if (extra.length)
      await tx.taskPart.deleteMany({
        where: { taskId, id: { in: extra.map((p) => p.id) } },
      });
    const kept = rows.slice(0, target);
    for (let i = 0; i < kept.length; i++) {
      const want = i < done;
      if (kept[i].done !== want)
        await tx.taskPart.update({
          where: { id: kept[i].id },
          data: { done: want },
          select: { id: true },
        });
    }
    let position = kept.length ? kept[kept.length - 1].position : 0;
    for (let i = kept.length; i < target; i++) {
      position += STEP;
      await tx.taskPart.create({
        data: { taskId, title: "", done: i < done, position },
        select: { id: true },
      });
    }
    const parts = await tx.taskPart.findMany({
      where: { taskId },
      orderBy: { position: "asc" },
      select: partSelect,
    });
    return { ok: true as const, target, done, parts };
  });
}
