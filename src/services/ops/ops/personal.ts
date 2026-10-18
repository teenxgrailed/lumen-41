import { loadPersonalOccurrences } from "@/services/personal-time/service";
import {
  type PersonalBlockRow,
  personalBlockSelect,
  personalBlockView,
} from "@/services/personal-time/service";
import { WorkspaceKind } from "@prisma/client";
import { z } from "zod";

import {
  addMinutes,
  formatInTimeZone,
  fromZonedTime,
  newDate,
} from "@/lib/date-utils";
import {
  PERSONAL_KINDS,
  PERSONAL_TONES,
  emojiOf,
  isValidRule,
  presetFor,
  weeklyRule,
} from "@/lib/personal-time";

import { OpError } from "../errors";
import { dateInputSchema, isoOrNull, touched, userTimeZone } from "../helpers";
import { defineOp } from "../types";
import type { OpContext, OpRunOutput } from "../types";

type View = ReturnType<typeof personalBlockView>;

const MAX_ACTIVE_BLOCKS = 500;

const blockId = z.string().min(1);
const kind = z.enum(PERSONAL_KINDS);
const tone = z.enum(PERSONAL_TONES);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
const rrule = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(isValidRule, "Not a valid repeat rule");

/** Personal time is the person's own, like calendar events: personal workspace only. */
function assertPersonal(ctx: OpContext) {
  if (ctx.workspace.workspaceKind !== WorkspaceKind.PERSONAL) {
    throw new OpError(
      "FORBIDDEN",
      "Personal time is unavailable in shared workspaces"
    );
  }
}

async function findBlock(
  ctx: OpContext,
  id: string,
  options: { includeArchived?: boolean } = {}
) {
  assertPersonal(ctx);
  const block = await ctx.tx.personalBlock.findFirst({
    where: {
      id,
      userId: ctx.userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    select: personalBlockSelect,
  });
  if (!block) throw new OpError("NOT_FOUND", "Personal time block not found");
  return block;
}

const blockFields = z
  .object({
    kind: z.string(),
    title: z.string(),
    emoji: z.string().nullable(),
    color: z.string().nullable(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    rrule: z.string().nullable(),
    isDefault: z.boolean(),
    archivedAt: isoOrNull,
  })
  .partial()
  .strict();
type BlockFields = z.infer<typeof blockFields>;

const DATE_FIELDS = ["start", "end", "archivedAt"] as const;

function pick(block: PersonalBlockRow, keys: (keyof BlockFields)[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = block[key];
    out[key] = value instanceof Date ? value.toISOString() : (value ?? null);
  }
  return out as BlockFields;
}

function data(fields: BlockFields) {
  const out: Record<string, unknown> = { ...fields };
  for (const key of DATE_FIELDS) {
    if (key in fields) {
      const value = fields[key];
      out[key] = value ? newDate(value) : null;
    }
  }
  return out;
}

async function assertRoom(ctx: OpContext) {
  const count = await ctx.tx.personalBlock.count({
    where: { userId: ctx.userId, archivedAt: null },
  });
  if (count >= MAX_ACTIVE_BLOCKS) {
    throw new OpError(
      "CONFLICT",
      `You can keep up to ${MAX_ACTIVE_BLOCKS} personal time blocks`
    );
  }
}

/** Resolves a create/update body into the stored columns, preset defaults filled. */
function resolveCreate(input: {
  kind?: (typeof PERSONAL_KINDS)[number];
  title?: string;
  emoji?: string;
  color?: (typeof PERSONAL_TONES)[number];
  start: string;
  end?: string;
  minutes?: number;
}) {
  const preset = presetFor(input.kind ?? "custom");
  const start = newDate(input.start);
  const length = input.minutes ?? preset?.minutes ?? 60;
  const end = input.end ? newDate(input.end) : addMinutes(start, length);
  if (end <= start) {
    throw new OpError("INVALID_INPUT", "The block must end after it starts");
  }
  const title = input.title?.trim() || preset?.title;
  if (!title) {
    throw new OpError("INVALID_INPUT", "A custom block needs a title");
  }
  return {
    kind: input.kind ?? "custom",
    title,
    emoji: input.emoji ?? preset?.emoji ?? null,
    color: input.color ?? null,
    start,
    end,
  };
}

const createInput = z
  .object({
    kind: kind.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    emoji: z.string().trim().min(1).max(16).optional(),
    color: tone.optional(),
    start: dateInputSchema,
    end: dateInputSchema.optional(),
    minutes: z
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .optional(),
    rrule: rrule.optional(),
  })
  .strict();

export const personalCreate = defineOp({
  name: "personal.create",
  description:
    "Keep time for yourself (lunch, break, walk, dinner, gym, party, rest, or a custom block). Tasks are never scheduled inside it. Give start and either end or minutes (a preset kind has a default length); rrule repeats it. Stays inside Needt, never written to Google or iCloud. Undo removes it.",
  risk: "reversible",
  input: createInput,
  async run(ctx, input) {
    assertPersonal(ctx);
    await assertRoom(ctx);
    const resolved = resolveCreate(input);
    const created = await ctx.tx.personalBlock.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        ...resolved,
        rrule: input.rrule ?? null,
      },
      select: personalBlockSelect,
    });
    return {
      result: { block: personalBlockView(created) },
      before: null,
      inverse: {
        op: "personal.restore",
        input: {
          blockId: created.id,
          fields: { archivedAt: newDate().toISOString() },
        },
      },
      touched: [touched("personalBlock", created, null)],
    };
  },
});

export const personalUpdate = defineOp({
  name: "personal.update",
  description:
    "Change a personal time block: title, emoji, tint, time or repeat (rrule, null to stop repeating). Undo writes the previous values back.",
  risk: "reversible",
  input: z
    .object({
      blockId,
      title: z.string().trim().min(1).max(120).optional(),
      emoji: z.string().trim().min(1).max(16).nullable().optional(),
      color: tone.nullable().optional(),
      start: dateInputSchema.optional(),
      end: dateInputSchema.optional(),
      rrule: rrule.nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 1, {
      message: "Nothing to update",
    }),
  async run(ctx, input) {
    const block = await findBlock(ctx, input.blockId);
    const fields: BlockFields = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.emoji !== undefined) fields.emoji = input.emoji;
    if (input.color !== undefined) fields.color = input.color;
    if (input.start !== undefined)
      fields.start = newDate(input.start).toISOString();
    if (input.end !== undefined) fields.end = newDate(input.end).toISOString();
    if (input.rrule !== undefined) fields.rrule = input.rrule;
    const start = fields.start ? newDate(fields.start) : block.start;
    const end = fields.end ? newDate(fields.end) : block.end;
    if (end <= start) {
      throw new OpError("INVALID_INPUT", "The block must end after it starts");
    }
    const keys = Object.keys(fields) as (keyof BlockFields)[];
    const previous = pick(block, keys);
    const updated = await ctx.tx.personalBlock.update({
      where: { id: block.id },
      data: data(fields),
      select: personalBlockSelect,
    });
    return {
      result: { block: personalBlockView(updated) },
      before: { fields: previous },
      inverse: {
        op: "personal.restore",
        input: { blockId: block.id, fields: previous },
      },
      touched: [touched("personalBlock", updated, block)],
    };
  },
});

export const personalDelete = defineOp({
  name: "personal.delete",
  description:
    "Remove a personal time block, a whole repeat included. It is kept, so Undo brings it back. A block marked on a synced event leaves the event itself untouched.",
  risk: "reversible",
  input: z.object({ blockId }).strict(),
  async run(ctx, input) {
    const block = await findBlock(ctx, input.blockId);
    const updated = await ctx.tx.personalBlock.update({
      where: { id: block.id },
      data: { archivedAt: newDate() },
      select: personalBlockSelect,
    });
    return {
      result: { block: personalBlockView(block), deleted: true },
      before: { fields: { archivedAt: null } },
      inverse: {
        op: "personal.restore",
        input: { blockId: block.id, fields: { archivedAt: null } },
      },
      touched: [touched("personalBlock", updated, block)],
    };
  },
});

export const personalMarkEvent = defineOp({
  name: "personal.mark_event",
  description:
    "Mark a calendar event (synced or your own) as personal time. Needt keeps a block linked to it, so no task is scheduled over it and it follows the event if it moves. The event itself is not changed and nothing is written to Google or iCloud. Undo removes the block.",
  risk: "reversible",
  input: z
    .object({
      eventId: z.string().min(1),
      kind: kind.optional(),
      title: z.string().trim().min(1).max(120).optional(),
      emoji: z.string().trim().min(1).max(16).optional(),
    })
    .strict(),
  async run(ctx, input) {
    assertPersonal(ctx);
    const event = await ctx.tx.calendarEvent.findFirst({
      where: {
        id: input.eventId,
        archivedAt: null,
        feed: { userId: ctx.userId },
      },
      select: { id: true, title: true, start: true, end: true },
    });
    if (!event) throw new OpError("NOT_FOUND", "Event not found");

    const existing = await ctx.tx.personalBlock.findFirst({
      where: {
        userId: ctx.userId,
        sourceEventId: event.id,
        archivedAt: null,
      },
      select: personalBlockSelect,
    });
    if (existing) {
      return {
        result: { block: personalBlockView(existing), already: true },
        before: null,
        inverse: null,
      };
    }
    await assertRoom(ctx);
    const preset = presetFor(input.kind ?? "custom");
    const created = await ctx.tx.personalBlock.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        kind: input.kind ?? "custom",
        title: input.title ?? preset?.title ?? event.title,
        emoji: input.emoji ?? preset?.emoji ?? null,
        start: event.start,
        end: event.end,
        sourceEventId: event.id,
      },
      select: personalBlockSelect,
    });
    return {
      result: { block: personalBlockView(created), already: false },
      before: null,
      inverse: {
        op: "personal.restore",
        input: {
          blockId: created.id,
          fields: { archivedAt: newDate().toISOString() },
        },
      },
      touched: [touched("personalBlock", created, null)],
    };
  },
});

export const personalSetDefault = defineOp({
  name: "personal.set_default",
  description:
    "Set a repeating default for a kind of personal time (for example Lunch on weekdays 13:00, 60 minutes). One per kind; enabled false removes it. Undo restores the previous default.",
  risk: "reversible",
  input: z
    .object({
      kind: z.enum(
        PERSONAL_KINDS.filter((k) => k !== "custom") as [
          Exclude<(typeof PERSONAL_KINDS)[number], "custom">,
          ...Exclude<(typeof PERSONAL_KINDS)[number], "custom">[],
        ]
      ),
      enabled: z.boolean(),
      at: clock.optional(),
      minutes: z
        .number()
        .int()
        .min(5)
        .max(24 * 60)
        .optional(),
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    })
    .strict(),
  async run(
    ctx,
    input
  ): Promise<OpRunOutput<{ block: View | null; removed: View | null }>> {
    assertPersonal(ctx);
    const preset = presetFor(input.kind);
    const existing = await ctx.tx.personalBlock.findFirst({
      where: {
        userId: ctx.userId,
        isDefault: true,
        kind: input.kind,
        archivedAt: null,
      },
      select: personalBlockSelect,
    });

    if (!input.enabled) {
      if (!existing) {
        return {
          result: { block: null, removed: null },
          before: null,
          inverse: null,
        };
      }
      const archived = await ctx.tx.personalBlock.update({
        where: { id: existing.id },
        data: { archivedAt: newDate() },
        select: personalBlockSelect,
      });
      return {
        result: { block: null, removed: personalBlockView(existing) },
        before: { fields: { archivedAt: null } },
        inverse: {
          op: "personal.restore",
          input: { blockId: existing.id, fields: { archivedAt: null } },
        },
        touched: [touched("personalBlock", archived, existing)],
      };
    }

    const timeZone = await userTimeZone(ctx.tx, ctx.userId);
    const today = formatInTimeZone(newDate(), timeZone, "yyyy-MM-dd");
    const at =
      input.at ??
      (existing
        ? formatInTimeZone(existing.start, timeZone, "HH:mm")
        : (preset?.at ?? "12:00"));
    const minutes =
      input.minutes ??
      (existing
        ? Math.round(
            (existing.end.getTime() - existing.start.getTime()) / 60_000
          )
        : (preset?.minutes ?? 60));
    const start = fromZonedTime(`${today}T${at}:00`, timeZone);
    const end = addMinutes(start, minutes);
    const days = input.days ?? [...(preset?.days ?? [1, 2, 3, 4, 5])];
    const rule = weeklyRule(days);
    if (!rule) throw new OpError("INVALID_INPUT", "Pick at least one day");

    if (existing) {
      const fields: BlockFields = {
        start: start.toISOString(),
        end: end.toISOString(),
        rrule: rule,
      };
      const keys = Object.keys(fields) as (keyof BlockFields)[];
      const previous = pick(existing, keys);
      const updated = await ctx.tx.personalBlock.update({
        where: { id: existing.id },
        data: data(fields),
        select: personalBlockSelect,
      });
      return {
        result: { block: personalBlockView(updated), removed: null },
        before: { fields: previous },
        inverse: {
          op: "personal.restore",
          input: { blockId: existing.id, fields: previous },
        },
        touched: [touched("personalBlock", updated, existing)],
      };
    }

    await assertRoom(ctx);
    const created = await ctx.tx.personalBlock.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        kind: input.kind,
        title: preset?.title ?? input.kind,
        emoji: preset?.emoji ?? null,
        start,
        end,
        rrule: rule,
        isDefault: true,
      },
      select: personalBlockSelect,
    });
    return {
      result: { block: personalBlockView(created), removed: null },
      before: null,
      inverse: {
        op: "personal.restore",
        input: {
          blockId: created.id,
          fields: { archivedAt: newDate().toISOString() },
        },
      },
      touched: [touched("personalBlock", created, null)],
    };
  },
});

export const personalList = defineOp({
  name: "personal.list",
  description:
    "List personal time blocks. With from and to (ISO), also returns every occurrence in that range, repeats and blocks linked to events included.",
  risk: "read",
  input: z
    .object({
      from: dateInputSchema.optional(),
      to: dateInputSchema.optional(),
      includeArchived: z.boolean().optional(),
    })
    .strict(),
  async run(ctx, input) {
    const blocks = await ctx.tx.personalBlock.findMany({
      where: {
        userId: ctx.userId,
        ...(input.includeArchived ? {} : { archivedAt: null }),
      },
      select: personalBlockSelect,
      orderBy: [{ start: "asc" }, { id: "asc" }],
      take: MAX_ACTIVE_BLOCKS,
    });
    // A block linked to a synced event follows the event: show where it is now.
    const linkedIds = blocks.flatMap((b) =>
      b.sourceEventId ? [b.sourceEventId] : []
    );
    const live = new Map(
      (linkedIds.length
        ? await ctx.tx.calendarEvent.findMany({
            where: {
              id: { in: linkedIds },
              archivedAt: null,
              feed: { userId: ctx.userId },
            },
            select: { id: true, start: true, end: true },
          })
        : []
      ).map((event) => [event.id, event])
    );
    const views = blocks.map((b) => {
      const event = b.sourceEventId ? live.get(b.sourceEventId) : undefined;
      return personalBlockView(
        event ? { ...b, start: event.start, end: event.end } : b
      );
    });
    let occurrences: Array<{
      blockId: string;
      title: string;
      emoji: string;
      tone: string;
      start: string;
      end: string;
      date: string;
    }> = [];
    if (input.from && input.to) {
      const found = await loadPersonalOccurrences(
        ctx.userId,
        newDate(input.from),
        newDate(input.to),
        ctx.tx
      );
      occurrences = found.map((o) => ({
        blockId: o.blockId,
        title: o.title,
        emoji: emojiOf(o),
        tone: o.tone,
        start: o.start.toISOString(),
        end: o.end.toISOString(),
        date: o.date,
      }));
    }
    return {
      result: { blocks: views, occurrences },
    };
  },
});

/** Inverse-only: writes stored block fields back. */
export const personalRestore = defineOp({
  name: "personal.restore",
  description: "Write stored personal block fields back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z.object({ blockId, fields: blockFields }).strict(),
  async run(ctx, input) {
    const block = await findBlock(ctx, input.blockId, {
      includeArchived: true,
    });
    const keys = Object.keys(input.fields) as (keyof BlockFields)[];
    const current = pick(block, keys);
    const updated = await ctx.tx.personalBlock.update({
      where: { id: block.id },
      data: data(input.fields),
      select: personalBlockSelect,
    });
    return {
      result: { block: personalBlockView(updated) },
      before: { fields: current },
      inverse: {
        op: "personal.restore",
        input: { blockId: block.id, fields: current },
      },
      touched: [touched("personalBlock", updated, block)],
    };
  },
});

export const personalOps = [
  personalList,
  personalCreate,
  personalUpdate,
  personalDelete,
  personalMarkEvent,
  personalSetDefault,
  personalRestore,
];
