import { MoodboardAccessRole, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  type MoodboardAccessActor,
  resolveMoodboardAccess,
} from "@/lib/auth/moodboard-auth";
import { prisma } from "@/lib/prisma";

/**
 * The references on a moodboard grid (`MoodboardItem`, docs/port/01-data-map.md
 * §7: the grid is the truth, the canvas tables stay untouched). One write path
 * for the board page, the phone wall and the public API.
 *
 * Order: `position` ascending, then `createdAt`, then `id`, so two items that
 * share a position still come back in a stable order.
 */

export const MOODBOARD_ITEM_KINDS = ["image", "link", "color", "note"] as const;
export type MoodboardItemKind = (typeof MOODBOARD_ITEM_KINDS)[number];

export const MOODBOARD_ITEM_ORDER = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.MoodboardItemOrderByWithRelationInput[];

/**
 * A reference by address: an absolute http(s) URL, or a path on this origin
 * (an asset Needt already serves). `data:`, `javascript:` and protocol-relative
 * `//host` addresses are refused, so the column never becomes an upload path.
 */
const referenceUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      if (value.startsWith("/")) return !value.startsWith("//");
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Use an http(s) URL or a path on this site" }
  );

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: "Use a hex colour like #c2410c",
  });

const sourceSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    domain: z.string().trim().max(253).optional(),
  })
  .strict();

/** Every field a client may write; anything else in the body is a 400. */
const writableFields = {
  url: referenceUrl.nullable(),
  color: hexColor.nullable(),
  text: z.string().max(10_000).nullable(),
  title: z.string().trim().max(240).nullable(),
  ratio: z.number().finite().min(0.05).max(20).nullable(),
  colorName: z.string().trim().max(120).nullable(),
  source: sourceSchema.nullable(),
  thumbnailUrl: referenceUrl.nullable(),
  position: z.number().finite(),
};

export const createMoodboardItemSchema = z
  .object({
    kind: z.enum(MOODBOARD_ITEM_KINDS),
    url: writableFields.url.optional(),
    color: writableFields.color.optional(),
    text: writableFields.text.optional(),
    title: writableFields.title.optional(),
    ratio: writableFields.ratio.optional(),
    colorName: writableFields.colorName.optional(),
    source: writableFields.source.optional(),
    thumbnailUrl: writableFields.thumbnailUrl.optional(),
    position: writableFields.position.optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    const need =
      item.kind === "image" || item.kind === "link"
        ? "url"
        : item.kind === "color"
          ? "color"
          : "text";
    const value = item[need];
    if (value === undefined || value === null || value === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [need],
        message: `A ${item.kind} reference needs ${need}`,
      });
    }
  });

/** A move, resize, caption or reorder. `kind` is fixed once created. */
export const updateMoodboardItemSchema = z
  .object({
    url: writableFields.url.optional(),
    color: writableFields.color.optional(),
    text: writableFields.text.optional(),
    title: writableFields.title.optional(),
    ratio: writableFields.ratio.optional(),
    colorName: writableFields.colorName.optional(),
    source: writableFields.source.optional(),
    thumbnailUrl: writableFields.thumbnailUrl.optional(),
    position: writableFields.position.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Nothing to change",
  });

export type CreateMoodboardItemInput = z.infer<
  typeof createMoodboardItemSchema
>;
export type UpdateMoodboardItemInput = z.infer<
  typeof updateMoodboardItemSchema
>;

const itemSelect = {
  id: true,
  moodboardId: true,
  kind: true,
  url: true,
  color: true,
  text: true,
  title: true,
  ratio: true,
  colorName: true,
  source: true,
  thumbnailUrl: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MoodboardItemSelect;

type ItemRow = Prisma.MoodboardItemGetPayload<{ select: typeof itemSelect }>;

export type PublicMoodboardItem = ReturnType<typeof toPublicMoodboardItem>;

function publicSource(source: Prisma.JsonValue | null) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const record = source as Record<string, unknown>;
  const out: { name?: string; domain?: string } = {};
  if (typeof record.name === "string") out.name = record.name;
  if (typeof record.domain === "string") out.domain = record.domain;
  return out;
}

/** Every field picked by name: a column added later stays server-side. */
export function toPublicMoodboardItem(item: ItemRow) {
  return {
    id: item.id,
    moodboardId: item.moodboardId,
    kind: item.kind,
    url: item.url,
    color: item.color,
    text: item.text,
    title: item.title,
    ratio: item.ratio,
    colorName: item.colorName,
    source: publicSource(item.source),
    thumbnailUrl: item.thumbnailUrl,
    position: item.position,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toData(input: Omit<UpdateMoodboardItemInput, "position">) {
  const data: Prisma.MoodboardItemUncheckedUpdateInput = {};
  if (input.url !== undefined) data.url = input.url;
  if (input.color !== undefined) data.color = input.color;
  if (input.text !== undefined) data.text = input.text;
  if (input.title !== undefined) data.title = input.title;
  if (input.ratio !== undefined) data.ratio = input.ratio;
  if (input.colorName !== undefined) data.colorName = input.colorName;
  if (input.source !== undefined) {
    data.source = input.source === null ? Prisma.DbNull : input.source;
  }
  if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl;
  return data;
}

/** The board is missing, in another workspace, or the role is too low. */
export class MoodboardItemAccessError extends Error {
  constructor() {
    super("Moodboard access denied");
    this.name = "MoodboardItemAccessError";
  }
}

/** The item id is not on the board named in the URL. */
export class MoodboardItemNotFoundError extends Error {
  constructor() {
    super("Moodboard item not found");
    this.name = "MoodboardItemNotFoundError";
  }
}

async function requireBoard(
  actor: MoodboardAccessActor,
  moodboardId: string,
  role: MoodboardAccessRole
) {
  const access = await resolveMoodboardAccess(actor, moodboardId, role);
  if (!access) throw new MoodboardItemAccessError();
  return access;
}

export async function listMoodboardItems(
  actor: MoodboardAccessActor,
  moodboardId: string
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.VIEWER);
  const items = await prisma.moodboardItem.findMany({
    where: { moodboardId },
    select: itemSelect,
    orderBy: MOODBOARD_ITEM_ORDER,
  });
  return items.map(toPublicMoodboardItem);
}

export async function createMoodboardItem(
  actor: MoodboardAccessActor,
  moodboardId: string,
  input: CreateMoodboardItemInput
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.EDITOR);
  const { position, kind, ...fields } = input;
  const item = await prisma.$transaction(async (tx) => {
    let at = position;
    if (at === undefined) {
      const last = await tx.moodboardItem.aggregate({
        where: { moodboardId },
        _max: { position: true },
      });
      at = (last._max.position ?? 0) + 1;
    }
    return tx.moodboardItem.create({
      data: {
        ...(toData(fields) as Prisma.MoodboardItemUncheckedCreateInput),
        moodboardId,
        kind,
        position: at,
      },
      select: itemSelect,
    });
  });
  return toPublicMoodboardItem(item);
}

export async function updateMoodboardItem(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string,
  input: UpdateMoodboardItemInput
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.EDITOR);
  const existing = await prisma.moodboardItem.findFirst({
    where: { id: itemId, moodboardId },
    select: { id: true },
  });
  if (!existing) throw new MoodboardItemNotFoundError();
  const { position, ...fields } = input;
  const item = await prisma.moodboardItem.update({
    where: { id: existing.id },
    data: {
      ...toData(fields),
      ...(position !== undefined ? { position } : {}),
    },
    select: itemSelect,
  });
  return toPublicMoodboardItem(item);
}

export async function deleteMoodboardItem(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.EDITOR);
  const { count } = await prisma.moodboardItem.deleteMany({
    where: { id: itemId, moodboardId },
  });
  if (count === 0) throw new MoodboardItemNotFoundError();
}
