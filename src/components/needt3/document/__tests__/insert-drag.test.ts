/**
 * The Insert tab's drag, the parts that are arithmetic: which boundary between
 * blocks a pointer is nearest, where its line is drawn, and how fast the page
 * scrolls near its edges.
 */
import { EDGE_MAX, dropIndexAt, dropLineAt, edgeSpeed } from "../insert-drag";

const blocks = [
  { top: 100, bottom: 124 },
  { top: 132, bottom: 156 },
  { top: 164, bottom: 188 },
];

describe("dropIndexAt", () => {
  it("is the boundary before the block whose middle is below the pointer", () => {
    expect(dropIndexAt(blocks, 90)).toBe(0);
    expect(dropIndexAt(blocks, 111)).toBe(0);
    expect(dropIndexAt(blocks, 113)).toBe(1);
    expect(dropIndexAt(blocks, 145)).toBe(2);
    expect(dropIndexAt(blocks, 400)).toBe(3);
  });
  it("is 0 on an empty page", () => {
    expect(dropIndexAt([], 50)).toBe(0);
  });
});

describe("dropLineAt", () => {
  it("sits in the gap between two blocks", () => {
    expect(dropLineAt(blocks, 1)).toBe(128);
    expect(dropLineAt(blocks, 2)).toBe(160);
  });
  it("hangs just outside the first and last blocks", () => {
    expect(dropLineAt(blocks, 0)).toBe(96);
    expect(dropLineAt(blocks, 3)).toBe(192);
  });
  it("has no line on an empty page", () => {
    expect(dropLineAt([], 0)).toBeNull();
  });
});

describe("edgeSpeed", () => {
  const box = { top: 0, bottom: 800 };
  it("is still in the middle", () => {
    expect(edgeSpeed(400, box)).toBe(0);
  });
  it("scrolls up near the top and down near the bottom, faster at the edge", () => {
    expect(edgeSpeed(0, box)).toBe(-EDGE_MAX);
    expect(edgeSpeed(32, box)).toBe(-EDGE_MAX / 2);
    expect(edgeSpeed(800, box)).toBe(EDGE_MAX);
    expect(edgeSpeed(768, box)).toBe(EDGE_MAX / 2);
  });
});
