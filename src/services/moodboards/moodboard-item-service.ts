import { MoodboardAccessRole, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  type MoodboardAccessActor,
  resolveMoodboardAccess,
} from "@/lib/auth/moodboard-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { type CanvasItem, readCanvasProjection } from "./moodboard-canvas";
import { unfurlLink } from "./unfurl";

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

/** Abuse limit on one board, the same for every plan. */
export const MOODBOARD_ITEM_LIMIT = 500;

const SAME_SITE_BASE = "https://x.invalid";

/**
 * A reference by address: an absolute http(s) URL, or a path on this origin
 * (an asset Needt already serves). `data:`, `javascript:` and protocol-relative
 * `//host` addresses are refused, so the column never becomes an upload path.
 * A path may not hold a backslash (a browser reads `/\evil.com` as another
 * host), must stay on this origin once normalised, and may not point into
 * `/api/`, so a reference never becomes a call to our own API. The one
 * exception is a picture uploaded to this very board (`ASSET_PATH`).
 */
/** `/api/moodboards/<board>/assets/<asset>`: a picture uploaded to a board. */
const ASSET_PATH =
  /^\/api\/moodboards\/([A-Za-z0-9_-]{1,64})\/assets\/([A-Za-z0-9_-]{1,64})$/;

/** The board and asset an uploaded picture's address names, or null. */
export function parseAssetPath(value: string) {
  const m = ASSET_PATH.exec(value);
  return m ? { moodboardId: m[1], assetId: m[2] } : null;
}

const referenceUrlOf = (allowAssets: boolean) =>
  z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (value) => {
        if (value.includes("\\")) return false;
        if (value.startsWith("/")) {
          if (value.startsWith("//")) return false;
          try {
            const url = new URL(value, SAME_SITE_BASE);
            if (url.origin !== SAME_SITE_BASE) return false;
            if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
              // Only an uploaded picture, and the service checks it is this
              // board's own and exists (`assertAssetUrl`).
              return allowAssets && ASSET_PATH.test(value);
            }
            return true;
          } catch {
            return false;
          }
        }
        try {
          const url = new URL(value);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch {
          return false;
        }
      },
      { message: "Use an http(s) URL or a path on this site" }
    );

const referenceUrl = referenceUrlOf(true);
const thumbnailAddress = referenceUrlOf(false);

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
  thumbnailUrl: thumbnailAddress.nullable(),
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

export type PublicMoodboardItem = ReturnType<typeof toPublicMoodboardItem> & {
  /** Drawn on the old canvas: shown read-only, not a row you can change. */
  fromCanvas?: true;
};

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

/** The board already holds MOODBOARD_ITEM_LIMIT references. */
export class MoodboardItemLimitError extends Error {
  readonly limit = MOODBOARD_ITEM_LIMIT;
  constructor() {
    super("Moodboard is full");
    this.name = "MoodboardItemLimitError";
  }
}

/** A patch would clear the field the item's kind cannot do without. */
export class MoodboardItemRequiredFieldError extends Error {
  constructor(
    readonly kind: string,
    readonly field: "url" | "color" | "text"
  ) {
    super(`A ${kind} reference needs ${field}`);
    this.name = "MoodboardItemRequiredFieldError";
  }
}

const REQUIRED_FIELD: Record<string, "url" | "color" | "text"> = {
  image: "url",
  link: "url",
  color: "color",
  note: "text",
};

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
    take: MOODBOARD_ITEM_LIMIT,
  });
  return items.map(toPublicMoodboardItem);
}

/** The tile's `url` may only name an uploaded picture of this very board. */
async function assertAssetUrl(
  db: Pick<typeof prisma, "moodboardAsset">,
  moodboardId: string,
  url: string | null | undefined
) {
  if (!url || !url.startsWith("/api/")) return;
  const asset = parseAssetPath(url);
  const found =
    asset && asset.moodboardId === moodboardId
      ? await db.moodboardAsset.findFirst({
          where: { id: asset.assetId, moodboardId },
          select: { id: true },
        })
      : null;
  if (!found) throw new MoodboardItemRequiredFieldError("image", "url");
}

/** Any change to a board's grid moves its "Date updated". */
export async function touchMoodboard(
  db: Pick<typeof prisma, "moodboard">,
  moodboardId: string
) {
  await db.moodboard.update({
    where: { id: moodboardId },
    data: { updatedAt: newDate() },
    select: { id: true },
  });
}

export async function createMoodboardItem(
  actor: MoodboardAccessActor,
  moodboardId: string,
  input: CreateMoodboardItemInput
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.EDITOR);
  const { position, kind, ...fields } = input;
  if (kind === "image") await assertAssetUrl(prisma, moodboardId, fields.url);
  else if (fields.url && fields.url.startsWith("/api/"))
    throw new MoodboardItemRequiredFieldError(kind, "url");
  // A link's preview is read from the page itself, outside the transaction
  // (it can take seconds). Whatever it cannot read, the link keeps as sent.
  if (kind === "link" && fields.url && !fields.thumbnailUrl) {
    const preview = await unfurlLink(fields.url);
    if (preview) {
      if (preview.title) fields.title = preview.title;
      if (preview.thumbnailUrl) fields.thumbnailUrl = preview.thumbnailUrl;
      if (preview.siteName)
        fields.source = { ...(fields.source ?? {}), name: preview.siteName };
    }
  }
  const item = await prisma.$transaction(async (tx) => {
    const count = await tx.moodboardItem.count({ where: { moodboardId } });
    if (count >= MOODBOARD_ITEM_LIMIT) throw new MoodboardItemLimitError();
    let at = position;
    if (at === undefined) {
      const last = await tx.moodboardItem.aggregate({
        where: { moodboardId },
        _max: { position: true },
      });
      at = (last._max.position ?? 0) + 1;
    }
    const created = await tx.moodboardItem.create({
      data: {
        ...(toData(fields) as Prisma.MoodboardItemUncheckedCreateInput),
        moodboardId,
        kind,
        position: at,
      },
      select: itemSelect,
    });
    await touchMoodboard(tx, moodboardId);
    return created;
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
    select: { id: true, kind: true },
  });
  if (!existing) throw new MoodboardItemNotFoundError();
  const required = REQUIRED_FIELD[existing.kind];
  if (required) {
    const next = input[required];
    if (next === null || next === "") {
      throw new MoodboardItemRequiredFieldError(existing.kind, required);
    }
  }
  const { position, ...fields } = input;
  if (fields.url !== undefined && fields.url !== null) {
    if (existing.kind === "image")
      await assertAssetUrl(prisma, moodboardId, fields.url);
    else if (fields.url.startsWith("/api/"))
      throw new MoodboardItemRequiredFieldError(existing.kind, "url");
  }
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.moodboardItem.update({
      where: { id: existing.id },
      data: {
        ...toData(fields),
        ...(position !== undefined ? { position } : {}),
      },
      select: itemSelect,
    });
    await touchMoodboard(tx, moodboardId);
    return updated;
  });
  return toPublicMoodboardItem(item);
}

export async function deleteMoodboardItem(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.EDITOR);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.moodboardItem.deleteMany({
      where: { id: itemId, moodboardId },
    });
    if (count === 0) throw new MoodboardItemNotFoundError();
    await touchMoodboard(tx, moodboardId);
  });
  // The picture row of an uploaded image is kept, so Undo can put the tile
  // back. //todo: a worker job that deletes assets no tile points at.
}

/* ---------- the whole grid: own rows, then what the canvas stored ---------- */

function canvasToPublic(item: CanvasItem): PublicMoodboardItem {
  return {
    id: item.id,
    moodboardId: "",
    kind: item.kind,
    url: item.url,
    color: null,
    text: item.text,
    title: item.title,
    ratio: item.ratio,
    colorName: null,
    source: null,
    thumbnailUrl: null,
    position: item.position,
    createdAt: item.createdAt ?? "",
    updatedAt: item.createdAt ?? "",
    fromCanvas: true,
  };
}

/**
 * What the board page draws: the board's own references in wall order, then
 * the tiles projected from the old canvas (read-only; see moodboard-canvas.ts)
 * and how many canvas elements have no grid form.
 */
export async function listMoodboardGrid(
  actor: MoodboardAccessActor,
  moodboardId: string
) {
  const items: PublicMoodboardItem[] = await listMoodboardItems(
    actor,
    moodboardId
  );
  const canvas = await readCanvasProjection(moodboardId);
  return {
    items: [
      ...items,
      ...canvas.items.map((c) => ({ ...canvasToPublic(c), moodboardId })),
    ],
    canvasSkipped: canvas.skipped,
  };
}

/* ---------- reorder ---------- */

export const reorderMoodboardItemsSchema = z
  .object({
    order: z.array(z.string().min(1).max(64)).min(1).max(MOODBOARD_ITEM_LIMIT),
  })
  .strict();

/** The order names a reference twice. */
export class MoodboardOrderError extends Error {
  constructor() {
    super("The order names a reference twice");
    this.name = "MoodboardOrderError";
  }
}

/**
 * Put the listed references in the given order. They take, in that order, the
 * places the listed ones held, so a reference added meanwhile (or one the
 * caller did not list) stays where it is; then the whole wall is renumbered
 * 1..n, which also unties references that shared a position. An id that is
 * not on this board is a 404 and nothing changes.
 */
export async function reorderMoodboardItems(
  actor: MoodboardAccessActor,
  moodboardId: string,
  order: readonly string[]
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.EDITOR);
  if (new Set(order).size !== order.length) throw new MoodboardOrderError();
  await prisma.$transaction(async (tx) => {
    const rows = await tx.moodboardItem.findMany({
      where: { moodboardId },
      select: { id: true, position: true },
      orderBy: MOODBOARD_ITEM_ORDER,
      take: MOODBOARD_ITEM_LIMIT,
    });
    const known = new Set(rows.map((r) => r.id));
    if (order.some((id) => !known.has(id)))
      throw new MoodboardItemNotFoundError();
    const listed = new Set(order);
    const next = rows.map((r) => r.id);
    let k = 0;
    rows.forEach((r, i) => {
      if (listed.has(r.id)) next[i] = order[k++];
    });
    for (let i = 0; i < next.length; i++) {
      const was = rows.find((r) => r.id === next[i]);
      if (was && was.position === i + 1 && rows[i].id === next[i]) continue;
      await tx.moodboardItem.update({
        where: { id: next[i] },
        data: { position: i + 1 },
        select: { id: true },
      });
    }
    await touchMoodboard(tx, moodboardId);
  });
  return listMoodboardItems(actor, moodboardId);
}

/* ---------- pictures ---------- */

/** The client downsizes to JPEG ≤ 900 px, so a real upload is far below this. */
export const MOODBOARD_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const MOODBOARD_ASSET_LIMIT = 1000;
export const MOODBOARD_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export class MoodboardUploadError extends Error {
  constructor(readonly code: "EMPTY" | "TOO_LARGE" | "BAD_TYPE") {
    super(
      code === "TOO_LARGE"
        ? "Pictures must be 4 MB or smaller"
        : code === "BAD_TYPE"
          ? "Only JPEG, PNG, WebP and GIF pictures are accepted"
          : "Choose a picture"
    );
    this.name = "MoodboardUploadError";
  }
}

/** The type the bytes really are (not what the client said), or null. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47
  )
    return "image/png";
  if (bytes.length >= 6 && at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46)
    return "image/gif";
  if (
    bytes.length >= 12 &&
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  )
    return "image/webp";
  return null;
}

/**
 * Store a picture and add its tile in one step, so a failed upload leaves no
 * stray row. The type is read from the bytes, the size is capped, and the
 * board's item limit applies exactly as for any other reference.
 */
export async function createMoodboardImage(
  actor: MoodboardAccessActor,
  moodboardId: string,
  input: {
    bytes: Buffer;
    name: string;
    title?: string | null;
    ratio?: number | null;
    position?: number;
  }
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.EDITOR);
  if (input.bytes.length === 0) throw new MoodboardUploadError("EMPTY");
  if (input.bytes.length > MOODBOARD_IMAGE_MAX_BYTES)
    throw new MoodboardUploadError("TOO_LARGE");
  const mimeType = sniffImageType(input.bytes);
  if (!mimeType) throw new MoodboardUploadError("BAD_TYPE");
  const ratio =
    typeof input.ratio === "number" &&
    Number.isFinite(input.ratio) &&
    input.ratio >= 0.05 &&
    input.ratio <= 20
      ? input.ratio
      : null;
  const item = await prisma.$transaction(async (tx) => {
    const [count, assets] = await Promise.all([
      tx.moodboardItem.count({ where: { moodboardId } }),
      tx.moodboardAsset.count({ where: { moodboardId } }),
    ]);
    if (count >= MOODBOARD_ITEM_LIMIT || assets >= MOODBOARD_ASSET_LIMIT)
      throw new MoodboardItemLimitError();
    let at = input.position;
    if (at === undefined || !Number.isFinite(at)) {
      const last = await tx.moodboardItem.aggregate({
        where: { moodboardId },
        _max: { position: true },
      });
      at = (last._max.position ?? 0) + 1;
    }
    const asset = await tx.moodboardAsset.create({
      data: {
        moodboardId,
        userId: actor.userId,
        originalName: input.name.slice(0, 240) || "picture",
        mimeType,
        size: input.bytes.length,
        bytes: input.bytes,
      },
      select: { id: true },
    });
    const created = await tx.moodboardItem.create({
      data: {
        moodboardId,
        kind: "image",
        url: `/api/moodboards/${moodboardId}/assets/${asset.id}`,
        title: input.title?.trim().slice(0, 240) || null,
        ratio,
        position: at,
      },
      select: itemSelect,
    });
    await touchMoodboard(tx, moodboardId);
    return created;
  });
  return toPublicMoodboardItem(item);
}

/** An uploaded picture's bytes, for anyone who may see the board. */
export async function readMoodboardAsset(
  actor: MoodboardAccessActor,
  moodboardId: string,
  assetId: string
) {
  await requireBoard(actor, moodboardId, MoodboardAccessRole.VIEWER);
  const asset = await prisma.moodboardAsset.findFirst({
    where: { id: assetId, moodboardId },
    select: { bytes: true, mimeType: true },
  });
  if (!asset) throw new MoodboardItemNotFoundError();
  return { bytes: Buffer.from(asset.bytes), mimeType: asset.mimeType };
}
