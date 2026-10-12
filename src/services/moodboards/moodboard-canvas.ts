import { Yjs as Y } from "@/lib/collaboration/yjs";
import { prisma } from "@/lib/prisma";

import { type MoodboardScene, readMoodboardScene } from "./moodboard-document";

/**
 * Read-side view of what the old collaborative canvas stored, so a board that
 * was drawn there still shows on the grid (design_v3). It only ever READS:
 * the Yjs state, the snapshots and their columns are never written, copied
 * into rows or deleted here, and a board that was never opened on the canvas
 * has no state row (this does not create one, unlike the collaboration token).
 *
 * What maps: image elements → photo tiles (the bytes are streamed by
 * `/api/moodboards/[id]/canvas-files/[fileId]`), text elements → notes.
 * Shapes, arrows and strokes have no grid form and are only counted.
 */

export const CANVAS_ID_PREFIX = "canvas:";
/** Canvas tiles sort after the board's own items. */
const CANVAS_POSITION_BASE = 1_000_000_000;
export const CANVAS_ITEM_LIMIT = 200;
export const CANVAS_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export interface CanvasItem {
  id: string;
  kind: "image" | "note";
  url: string | null;
  text: string | null;
  title: string | null;
  ratio: number | null;
  position: number;
  createdAt: string | null;
}

export interface CanvasProjection {
  items: CanvasItem[];
  /** Elements with no grid form (shapes, arrows, freehand strokes). */
  skipped: number;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Pure: the grid tiles for a canvas scene, in reading order (top to bottom, left to right). */
export function canvasProjection(
  scene: MoodboardScene,
  moodboardId: string
): CanvasProjection {
  const live = scene.elements.filter((e) => e.isDeleted !== true);
  const tiles: { y: number; x: number; item: Omit<CanvasItem, "position"> }[] =
    [];
  let skipped = 0;
  for (const el of live) {
    const id = typeof el.id === "string" ? el.id : null;
    if (!id) continue;
    if (el.type === "image" && typeof el.fileId === "string") {
      const file = scene.files[el.fileId];
      const mime = typeof file?.mimeType === "string" ? file.mimeType : "";
      if (!file || !(CANVAS_IMAGE_TYPES as readonly string[]).includes(mime)) {
        skipped++;
        continue;
      }
      const w = num(el.width);
      const h = num(el.height);
      const created = typeof file.created === "number" ? file.created : null;
      tiles.push({
        y: num(el.y),
        x: num(el.x),
        item: {
          id: CANVAS_ID_PREFIX + id,
          kind: "image",
          url: `/api/moodboards/${moodboardId}/canvas-files/${encodeURIComponent(el.fileId)}`,
          text: null,
          title: null,
          ratio: w > 0 && h > 0 ? Math.min(20, Math.max(0.05, h / w)) : null,
          createdAt: created ? new Date(created).toISOString() : null,
        },
      });
    } else if (el.type === "text" && typeof el.text === "string") {
      const text = el.text.trim();
      if (!text) continue;
      tiles.push({
        y: num(el.y),
        x: num(el.x),
        item: {
          id: CANVAS_ID_PREFIX + id,
          kind: "note",
          url: null,
          text: text.slice(0, 10_000),
          title: null,
          ratio: Math.min(1.4, 0.5 + text.length / 160),
          createdAt: null,
        },
      });
    } else {
      skipped++;
    }
  }
  tiles.sort((a, b) => a.y - b.y || a.x - b.x);
  const kept = tiles.slice(0, CANVAS_ITEM_LIMIT);
  skipped += tiles.length - kept.length;
  return {
    items: kept.map((t, i) => ({
      ...t.item,
      position: CANVAS_POSITION_BASE + i,
    })),
    skipped,
  };
}

/** The canvas's current scene: the live Yjs state, else the newest snapshot; null when it never had one. */
export async function readCanvasScene(
  moodboardId: string
): Promise<MoodboardScene | null> {
  const stored = await prisma.moodboardCollaborationState.findUnique({
    where: { moodboardId },
    select: { state: true },
  });
  if (stored) {
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, new Uint8Array(stored.state));
      return readMoodboardScene(doc);
    } finally {
      doc.destroy();
    }
  }
  const snapshot = await prisma.moodboardSnapshot.findFirst({
    where: { moodboardId },
    orderBy: { createdAt: "desc" },
    select: { scene: true },
  });
  const scene = snapshot?.scene as Partial<MoodboardScene> | null | undefined;
  if (!scene || !Array.isArray(scene.elements)) return null;
  return {
    elements: scene.elements as MoodboardScene["elements"],
    appState: (scene.appState ?? {}) as MoodboardScene["appState"],
    files: (scene.files ?? {}) as MoodboardScene["files"],
  };
}

export async function readCanvasProjection(
  moodboardId: string
): Promise<CanvasProjection> {
  try {
    const scene = await readCanvasScene(moodboardId);
    return scene
      ? canvasProjection(scene, moodboardId)
      : { items: [], skipped: 0 };
  } catch {
    // A state that cannot be decoded must not take the grid down with it.
    return { items: [], skipped: 0 };
  }
}

const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** One file of the canvas as bytes, only for the image types the grid shows. */
export async function readCanvasFile(moodboardId: string, fileId: string) {
  const scene = await readCanvasScene(moodboardId);
  const file = scene?.files[fileId];
  const dataUrl = typeof file?.dataURL === "string" ? file.dataURL : "";
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!(CANVAS_IMAGE_TYPES as readonly string[]).includes(mime)) return null;
  return { mime, bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64") };
}
