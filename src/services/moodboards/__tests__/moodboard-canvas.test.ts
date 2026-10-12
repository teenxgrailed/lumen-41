import { Yjs as Y } from "@/lib/collaboration/yjs";

import {
  canvasProjection,
  readCanvasFile,
  readCanvasProjection,
} from "../moodboard-canvas";
import { writeMoodboardScene } from "../moodboard-document";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    moodboardCollaborationState: { findUnique: jest.fn() },
    moodboardSnapshot: { findFirst: jest.fn() },
  },
}));
const { prisma } = jest.requireMock<{
  prisma: {
    moodboardCollaborationState: { findUnique: jest.Mock };
    moodboardSnapshot: { findFirst: jest.Mock };
  };
}>("@/lib/prisma");

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const scene = {
  appState: {},
  files: {
    f1: {
      id: "f1",
      mimeType: "image/png",
      dataURL: PNG,
      created: 1_700_000_000_000,
    },
    f2: {
      id: "f2",
      mimeType: "image/svg+xml",
      dataURL: "data:image/svg+xml;base64,PHN2Zz4=",
    },
  },
  elements: [
    { id: "t-low", type: "text", text: "  Lower note ", x: 10, y: 400 },
    {
      id: "img",
      type: "image",
      fileId: "f1",
      x: 5,
      y: 10,
      width: 200,
      height: 100,
    },
    {
      id: "gone",
      type: "image",
      fileId: "f1",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      isDeleted: true,
    },
    {
      id: "svg",
      type: "image",
      fileId: "f2",
      x: 0,
      y: 5,
      width: 10,
      height: 10,
    },
    { id: "box", type: "rectangle", x: 0, y: 0 },
    { id: "arrow", type: "arrow", x: 0, y: 0 },
    { id: "blank", type: "text", text: "   ", x: 0, y: 0 },
    { id: "t-high", type: "text", text: "Top note", x: 50, y: 20 },
  ],
};

describe("canvasProjection", () => {
  const out = canvasProjection(scene, "b1");

  it("shows images and text in reading order, after any rows (position far above them)", () => {
    expect(out.items.map((i) => i.id)).toEqual([
      "canvas:img",
      "canvas:t-high",
      "canvas:t-low",
    ]);
    expect(out.items.every((i) => i.position >= 1_000_000_000)).toBe(true);
    expect(out.items.map((i) => i.position)).toEqual(
      [...out.items.map((i) => i.position)].sort((a, b) => a - b)
    );
  });

  it("maps an image to a photo served read-only, with its ratio", () => {
    const img = out.items[0];
    expect(img).toMatchObject({
      kind: "image",
      url: "/api/moodboards/b1/canvas-files/f1",
      ratio: 0.5,
      createdAt: new Date(1_700_000_000_000).toISOString(),
    });
  });

  it("maps text to a note and trims it", () => {
    expect(out.items[2]).toMatchObject({ kind: "note", text: "Lower note" });
  });

  it("counts what has no grid form instead of inventing it (shapes, an unsafe image type)", () => {
    // rectangle, arrow, and the svg image; deleted and blank text are not counted
    expect(out.skipped).toBe(3);
  });

  it("caps the tiles and counts the rest as left out", () => {
    const many = {
      appState: {},
      files: {},
      elements: Array.from({ length: 230 }, (_, i) => ({
        id: `t${i}`,
        type: "text",
        text: `n${i}`,
        x: i,
        y: i,
      })),
    };
    const r = canvasProjection(many, "b1");
    expect(r.items).toHaveLength(200);
    expect(r.skipped).toBe(30);
  });
});

describe("reading the canvas", () => {
  beforeEach(() => {
    prisma.moodboardCollaborationState.findUnique.mockReset();
    prisma.moodboardSnapshot.findFirst.mockReset();
  });

  function liveState() {
    const doc = new Y.Doc();
    writeMoodboardScene(doc, {
      appState: {},
      files: { f1: scene.files.f1 },
      elements: [scene.elements[1], scene.elements[7]],
    });
    return Buffer.from(Y.encodeStateAsUpdate(doc));
  }

  it("reads the live Yjs state, and only reads", async () => {
    prisma.moodboardCollaborationState.findUnique.mockResolvedValue({
      state: liveState(),
    });
    const r = await readCanvasProjection("b1");
    expect(r.items.map((i) => i.id)).toEqual(["canvas:img", "canvas:t-high"]);
    expect(prisma.moodboardCollaborationState.findUnique).toHaveBeenCalledTimes(
      1
    );
    // nothing in the mock can write: a create/update call would be a TypeError
  });

  it("falls back to the newest snapshot when there is no live state", async () => {
    prisma.moodboardCollaborationState.findUnique.mockResolvedValue(null);
    prisma.moodboardSnapshot.findFirst.mockResolvedValue({ scene });
    const r = await readCanvasProjection("b1");
    expect(r.items).toHaveLength(3);
  });

  it("is empty for a board that never had a canvas", async () => {
    prisma.moodboardCollaborationState.findUnique.mockResolvedValue(null);
    prisma.moodboardSnapshot.findFirst.mockResolvedValue(null);
    expect(await readCanvasProjection("b1")).toEqual({ items: [], skipped: 0 });
  });

  it("does not take the grid down when the state cannot be decoded", async () => {
    prisma.moodboardCollaborationState.findUnique.mockResolvedValue({
      state: Buffer.from([1, 2, 3, 4, 5]),
    });
    expect(await readCanvasProjection("b1")).toEqual({ items: [], skipped: 0 });
  });

  it("streams a picture's bytes, only for the image types the grid shows", async () => {
    prisma.moodboardCollaborationState.findUnique.mockResolvedValue(null);
    prisma.moodboardSnapshot.findFirst.mockResolvedValue({ scene });
    const f = await readCanvasFile("b1", "f1");
    expect(f?.mime).toBe("image/png");
    expect(f?.bytes.length).toBeGreaterThan(0);
    expect(await readCanvasFile("b1", "f2")).toBeNull(); // svg can carry script
    expect(await readCanvasFile("b1", "nope")).toBeNull();
  });
});
