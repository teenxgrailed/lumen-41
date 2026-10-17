import { createLocalEvent } from "@/services/connectors/local-events";
import {
  appendPageBlocks,
  createPage,
  getPage,
  updatePage,
} from "@/services/pages/page-service";
import {
  PAGE_TEXT_MAX_LENGTH,
  pageBlocksFromText,
} from "@/services/pages/page-text-blocks";
import {
  PageCollaborationActiveError,
  PageRevisionConflictError,
  writePageBlocks,
} from "@/services/pages/page-write-path";
import { PageAuthor, WorkspaceKind } from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { OpError } from "../errors";
import { dateInputSchema, isoOrNull, touched } from "../helpers";
import { defineOp } from "../types";
import type { OpContext } from "../types";

// ------------------------------------------------------------------ events

const eventId = z.string().min(1);

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
};

export function eventView(event: EventRow) {
  return {
    id: event.id,
    title: event.title,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    location: event.location,
    description: event.description,
    href: `/calendar?event=${event.id}`,
  };
}

function assertPersonal(ctx: OpContext) {
  if (ctx.workspace.workspaceKind !== WorkspaceKind.PERSONAL) {
    throw new OpError(
      "FORBIDDEN",
      "Calendar events are personal and unavailable in shared workspaces"
    );
  }
}

/** A Needt-local event of the caller. Synced provider events are not editable. */
async function findLocalEvent(
  ctx: OpContext,
  id: string,
  options: { includeArchived?: boolean } = {}
) {
  assertPersonal(ctx);
  const event = await ctx.tx.calendarEvent.findFirst({
    where: {
      id,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
  });
  const feed = event
    ? await ctx.tx.calendarFeed.findFirst({
        where: { id: event.feedId, userId: ctx.userId },
        select: { id: true, type: true },
      })
    : null;
  if (!event || !feed) throw new OpError("NOT_FOUND", "Event not found");
  if (feed.type !== "LOCAL") {
    throw new OpError(
      "UNSUPPORTED",
      "Only events in a Needt calendar can be changed here, not synced provider events"
    );
  }
  return event as EventRow & { feedId: string };
}

const eventFields = z
  .object({
    title: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    allDay: z.boolean(),
    archivedAt: isoOrNull,
  })
  .partial()
  .strict();
type EventFields = z.infer<typeof eventFields>;

const EVENT_DATE_FIELDS = ["start", "end", "archivedAt"] as const;

function pickEvent(event: EventRow, keys: (keyof EventFields)[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = event[key];
    out[key] = value instanceof Date ? value.toISOString() : (value ?? null);
  }
  return out as EventFields;
}

function eventData(fields: EventFields) {
  const data: Record<string, unknown> = { ...fields };
  for (const key of EVENT_DATE_FIELDS) {
    if (key in fields) {
      const value = fields[key];
      data[key] = value ? newDate(value) : null;
    }
  }
  return data;
}

export const eventCreate = defineOp({
  name: "event.create",
  description:
    "Create an event in a Needt calendar (the first one unless feedId is given). Personal workspace only. Undo removes it.",
  risk: "reversible",
  transactional: false,
  input: z
    .object({
      title: z.string().trim().min(1).max(500),
      start: dateInputSchema,
      end: dateInputSchema,
      allDay: z.boolean().optional(),
      location: z.string().max(1000).optional(),
      description: z.string().max(20_000).optional(),
      feedId: z.string().min(1).optional(),
    })
    .strict(),
  async run(ctx, input) {
    assertPersonal(ctx);
    const created = await createLocalEvent(ctx.userId, input);
    if (!created.ok) {
      throw new OpError(
        created.status === 404
          ? "NOT_FOUND"
          : created.status === 409
            ? "CONFLICT"
            : "INVALID_INPUT",
        created.error
      );
    }
    const event = created.event;
    return {
      result: { event: eventView(event) },
      before: null,
      inverse: {
        op: "event.restore",
        input: {
          eventId: event.id,
          fields: { archivedAt: newDate().toISOString() },
        },
      },
      touched: [touched("event", event, null)],
    };
  },
});

export const eventUpdate = defineOp({
  name: "event.update",
  description:
    "Change an event's title, time, place or notes. Needt-calendar events only. Undo writes the previous values back.",
  risk: "reversible",
  input: z
    .object({
      eventId,
      title: z.string().trim().min(1).max(500).optional(),
      start: dateInputSchema.optional(),
      end: dateInputSchema.optional(),
      allDay: z.boolean().optional(),
      location: z.string().max(1000).nullable().optional(),
      description: z.string().max(20_000).nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 1, {
      message: "Nothing to update",
    }),
  async run(ctx, input) {
    const event = await findLocalEvent(ctx, input.eventId);
    const fields: EventFields = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.start !== undefined)
      fields.start = newDate(input.start).toISOString();
    if (input.end !== undefined) fields.end = newDate(input.end).toISOString();
    if (input.allDay !== undefined) fields.allDay = input.allDay;
    if (input.location !== undefined) fields.location = input.location;
    if (input.description !== undefined) fields.description = input.description;

    const start = fields.start ? newDate(fields.start) : event.start;
    const end = fields.end ? newDate(fields.end) : event.end;
    if (end <= start) {
      throw new OpError("INVALID_INPUT", "Event end must be after its start");
    }
    const keys = Object.keys(fields) as (keyof EventFields)[];
    const previous = pickEvent(event, keys);
    const updated = await ctx.tx.calendarEvent.update({
      where: { id: event.id },
      data: eventData(fields),
    });
    return {
      result: { event: eventView(updated as EventRow) },
      before: { fields: previous },
      inverse: {
        op: "event.restore",
        input: { eventId: event.id, fields: previous },
      },
      touched: [touched("event", updated as EventRow, event)],
    };
  },
});

export const eventDelete = defineOp({
  name: "event.delete",
  description:
    "Delete an event (it leaves the calendar but is kept, so Undo brings it back). Needt-calendar events only.",
  risk: "reversible",
  input: z.object({ eventId }).strict(),
  async run(ctx, input) {
    const event = await findLocalEvent(ctx, input.eventId);
    const updated = await ctx.tx.calendarEvent.update({
      where: { id: event.id },
      data: { archivedAt: newDate() },
    });
    return {
      result: { event: eventView(event), deleted: true },
      before: { fields: { archivedAt: null } },
      inverse: {
        op: "event.restore",
        input: { eventId: event.id, fields: { archivedAt: null } },
      },
      touched: [touched("event", updated as EventRow, event)],
    };
  },
});

/** Inverse-only: writes stored event fields back. */
export const eventRestore = defineOp({
  name: "event.restore",
  description: "Write stored event fields back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z.object({ eventId, fields: eventFields }).strict(),
  async run(ctx, input) {
    const event = await findLocalEvent(ctx, input.eventId, {
      includeArchived: true,
    });
    const keys = Object.keys(input.fields) as (keyof EventFields)[];
    const current = pickEvent(event, keys);
    const updated = await ctx.tx.calendarEvent.update({
      where: { id: event.id },
      data: eventData(input.fields),
    });
    return {
      result: { event: eventView(updated as EventRow) },
      before: { fields: current },
      inverse: {
        op: "event.restore",
        input: { eventId: event.id, fields: current },
      },
      touched: [touched("event", updated as EventRow, event)],
    };
  },
});

// ------------------------------------------------------------------- pages

const pageText = z.string().trim().min(1).max(PAGE_TEXT_MAX_LENGTH);
const pageFormat = z.enum(["markdown", "plain"]).default("markdown");

function pageActor(ctx: OpContext) {
  return { userId: ctx.userId, workspace: ctx.workspace };
}

function pageAuthor(ctx: OpContext) {
  return ctx.actor === "user" ? PageAuthor.HUMAN : PageAuthor.AI;
}

/** The write path refuses some states with typed errors; say them in words. */
function pageWriteFailure(error: unknown): never {
  if (error instanceof PageCollaborationActiveError) {
    throw new OpError(
      "CONFLICT",
      "This page is open for live editing. Try again once it is closed"
    );
  }
  if (error instanceof PageRevisionConflictError) {
    throw new OpError("CONFLICT", "The page changed while writing. Try again");
  }
  throw error;
}

function pageView(page: { id: string; title: string }) {
  return { id: page.id, title: page.title, href: `/pages/${page.id}` };
}

export const pageCreate = defineOp({
  name: "page.create",
  description:
    "Create a page, optionally under a parent page, with an optional Markdown or plain-text body. Undo moves the page to Trash.",
  risk: "reversible",
  transactional: false,
  input: z
    .object({
      title: z.string().trim().min(1).max(240),
      body: pageText.optional(),
      format: pageFormat,
      parentId: z.string().min(1).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const actor = pageActor(ctx);
    const blocks = input.body
      ? pageBlocksFromText(input.body, input.format)
      : [];
    let page;
    try {
      page = await createPage(actor, {
        title: input.title,
        parentId: input.parentId ?? null,
        createdBy: pageAuthor(ctx),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Parent page not found") {
        throw new OpError("NOT_FOUND", error.message);
      }
      throw error;
    }
    let final = page;
    if (blocks.length) {
      try {
        final =
          (await writePageBlocks(
            actor,
            page.id,
            blocks.map((block, index) => ({
              ...block,
              position: (index + 1) * 1024,
            })),
            pageAuthor(ctx),
            1,
            page.contentRevision
          )) ?? page;
      } catch (error) {
        pageWriteFailure(error);
      }
    }
    return {
      result: { page: pageView(final), blocks: blocks.length },
      before: null,
      inverse: {
        op: "page.set_trashed",
        input: { pageId: page.id, trashed: true },
      },
      touched: [touched("page", final, null)],
    };
  },
});

export const pageAppend = defineOp({
  name: "page.append",
  description:
    "Append Markdown or plain text to the end of a page you can edit. Earlier content is kept. Undo removes exactly the appended blocks.",
  risk: "reversible",
  transactional: false,
  input: z
    .object({ pageId: z.string().min(1), text: pageText, format: pageFormat })
    .strict(),
  async run(ctx, input) {
    const actor = pageActor(ctx);
    const blocks = pageBlocksFromText(input.text, input.format);
    if (!blocks.length) {
      throw new OpError("INVALID_INPUT", "The text has no content");
    }
    const page = await getPage(actor, input.pageId);
    if (!page) {
      throw new OpError("NOT_FOUND", "Page not found, or you cannot edit it");
    }
    const knownIds = new Set(page.blocks.map((block) => block.id));
    let written;
    try {
      written = await appendPageBlocks(actor, page, blocks, pageAuthor(ctx));
    } catch (error) {
      pageWriteFailure(error);
    }
    if (!written) {
      throw new OpError("NOT_FOUND", "Page not found, or you cannot edit it");
    }
    const appendedIds = written.blocks
      .map((block) => block.id)
      .filter((id) => !knownIds.has(id));
    return {
      result: { page: pageView(written), appendedBlocks: appendedIds.length },
      before: { blockCount: page.blocks.length },
      inverse: appendedIds.length
        ? {
            op: "page.remove_blocks",
            input: { pageId: page.id, blockIds: appendedIds },
          }
        : null,
      touched: [touched("page", written, page)],
    };
  },
});

/** Inverse-only: trashes or restores a page. */
export const pageSetTrashed = defineOp({
  name: "page.set_trashed",
  description: "Move a page to Trash or bring it back. Used only by undo.",
  risk: "reversible",
  internal: true,
  transactional: false,
  input: z.object({ pageId: z.string().min(1), trashed: z.boolean() }).strict(),
  async run(ctx, input) {
    const actor = pageActor(ctx);
    const before = await prisma.page.findFirst({
      where: { id: input.pageId },
      select: { updatedAt: true, trashedAt: true },
    });
    const page = await updatePage(actor, input.pageId, {
      trashed: input.trashed,
    });
    if (!page) throw new OpError("NOT_FOUND", "Page not found");
    return {
      result: { page: pageView(page) },
      before: { trashed: Boolean(before?.trashedAt) },
      inverse: {
        op: "page.set_trashed",
        input: { pageId: input.pageId, trashed: !input.trashed },
      },
      touched: [touched("page", page, before)],
    };
  },
});

/** Inverse-only: removes blocks an append added. */
export const pageRemoveBlocks = defineOp({
  name: "page.remove_blocks",
  description: "Remove blocks an append added. Used only by undo.",
  risk: "reversible",
  internal: true,
  transactional: false,
  input: z
    .object({
      pageId: z.string().min(1),
      blockIds: z.array(z.string().min(1)).min(1).max(2000),
    })
    .strict(),
  async run(ctx, input) {
    const actor = pageActor(ctx);
    const page = await getPage(actor, input.pageId);
    if (!page) throw new OpError("NOT_FOUND", "Page not found");
    const remove = new Set(input.blockIds);
    const keep = page.blocks.filter((block) => !remove.has(block.id));
    let written;
    try {
      written = await writePageBlocks(
        actor,
        page.id,
        keep.map((block) => ({
          id: block.id,
          parentBlockId: block.parentBlockId,
          type: block.type,
          content: JSON.parse(JSON.stringify(block.content)),
          position: block.position,
          createdBy: block.createdBy,
        })),
        pageAuthor(ctx),
        page.documentFormatVersion === 2 ? 2 : 1,
        page.contentRevision
      );
    } catch (error) {
      pageWriteFailure(error);
    }
    if (!written) throw new OpError("NOT_FOUND", "Page not found");
    return {
      result: {
        page: pageView(written),
        removedBlocks: page.blocks.length - keep.length,
      },
      before: { blockIds: input.blockIds },
      inverse: null,
      touched: [touched("page", written, page)],
    };
  },
});

export const eventPageOps = [
  eventCreate,
  eventUpdate,
  eventDelete,
  eventRestore,
  pageCreate,
  pageAppend,
  pageSetTrashed,
  pageRemoveBlocks,
];
