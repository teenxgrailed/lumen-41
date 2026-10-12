export const ASSISTANT_POSITION_KEY = "needt-ai-companion-position-v1";
export const ASSISTANT_POSITION_RESET_EVENT = "needt:assistant-position-reset";

export type Point = {
  x: number;
  y: number;
};

export type PositionBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type NormalizedAssistantPosition = {
  x: number;
  y: number;
};

export function clampPoint(point: Point, bounds: PositionBounds): Point {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y)),
  };
}

export function companionBounds({
  viewportWidth,
  viewportHeight,
  size,
  sidebarWidth,
  mobileDockHeight,
  safeTop = 0,
  safeBottom = 0,
}: {
  viewportWidth: number;
  viewportHeight: number;
  size: number;
  sidebarWidth: number;
  mobileDockHeight: number;
  safeTop?: number;
  safeBottom?: number;
}): PositionBounds {
  const desktop = viewportWidth >= 1024;
  const edge = desktop ? 20 : 12;
  const minX = desktop ? sidebarWidth + edge : edge;
  const maxX = Math.max(minX, viewportWidth - size - edge);
  const minY = safeTop + edge;
  const bottomClearance = desktop ? edge : mobileDockHeight + safeBottom + edge;

  return {
    minX,
    maxX,
    minY,
    maxY: Math.max(minY, viewportHeight - size - bottomClearance),
  };
}

export function toNormalized(
  point: Point,
  bounds: PositionBounds
): NormalizedAssistantPosition {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const clamped = clampPoint(point, bounds);
  return {
    x: (clamped.x - bounds.minX) / width,
    y: (clamped.y - bounds.minY) / height,
  };
}

export function fromNormalized(
  position: NormalizedAssistantPosition,
  bounds: PositionBounds
): Point {
  return clampPoint(
    {
      x:
        bounds.minX +
        Math.min(1, Math.max(0, position.x)) * (bounds.maxX - bounds.minX),
      y:
        bounds.minY +
        Math.min(1, Math.max(0, position.y)) * (bounds.maxY - bounds.minY),
    },
    bounds
  );
}

export function isNormalizedAssistantPosition(
  value: unknown
): value is NormalizedAssistantPosition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NormalizedAssistantPosition>;
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    candidate.x >= 0 &&
    candidate.x <= 1 &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    candidate.y >= 0 &&
    candidate.y <= 1
  );
}

/* ── THE CORNER (design v3) ─────────────────────────────────────────────
 * Ask Needt is one element in the bottom-right corner at three sizes: the
 * pill, the island (the pill grown to carry notices), and the panel. The
 * element is laid out once at the largest size it can take and the visible
 * shape is a `clip-path` inset anchored to the bottom-right, so a size change
 * is a clip, never a width/height/radius animation (port rule 12). Sizes are
 * the vendored chat.css values, which win over older briefs.
 */

/** Inset of the corner from both window edges. */
export const CORNER_GUTTER = 20;

export type CornerSize = { w: number; h: number; r: number };

/** "Ask Needt  ⌘J" — `.chat-div` is 142×40, radius 12. */
export const CORNER_PILL: CornerSize = { w: 142, h: 40, r: 12 };
/** One island row; the island is `rows × ISLAND_ROW_H` tall. */
export const ISLAND_ROW_H = 54;
/** The "N more" line under the rows, drawn only when rows are hidden. */
export const ISLAND_COUNT_H = 28;
export const ISLAND_W = 376;
export const ISLAND_RADIUS = 18;
/** `.chat-panel`: 400 wide, min(600, viewport − 40) tall, radius 20. */
export const CORNER_PANEL_W = 400;
export const CORNER_PANEL_MAX_H = 600;
export const CORNER_PANEL_RADIUS = 20;

export function cornerPanel(viewportHeight: number): CornerSize {
  return {
    w: CORNER_PANEL_W,
    h: Math.max(
      CORNER_PILL.h,
      Math.min(CORNER_PANEL_MAX_H, viewportHeight - 2 * CORNER_GUTTER)
    ),
    r: CORNER_PANEL_RADIUS,
  };
}

export function cornerIsland(rows: number, counted: boolean): CornerSize {
  const n = Math.max(1, Math.floor(rows));
  return {
    w: ISLAND_W,
    h: n * ISLAND_ROW_H + (counted ? ISLAND_COUNT_H : 0),
    r: ISLAND_RADIUS,
  };
}

/** The box the corner element is laid out at: big enough for every shape. */
export function cornerFrame(...sizes: CornerSize[]): { w: number; h: number } {
  return {
    w: Math.max(...sizes.map((s) => s.w)),
    h: Math.max(...sizes.map((s) => s.h)),
  };
}

/**
 * The clip that shows `size` inside `frame`, anchored bottom-right:
 * `inset(top right bottom left round r)`.
 */
export function cornerClip(
  size: CornerSize,
  frame: { w: number; h: number }
): string {
  const top = Math.max(0, frame.h - size.h);
  const left = Math.max(0, frame.w - size.w);
  return `inset(${top}px 0px 0px ${left}px round ${size.r}px)`;
}

/**
 * Where the agent's hand starts and ends: the middle of the closed pill. It is
 * measured off the shell's corner, not off the element, because while the
 * panel is open the element is a 400px panel and its middle is not the pill.
 */
export function cornerHome(shell: { right: number; bottom: number }): Point {
  return {
    x: shell.right - CORNER_GUTTER - CORNER_PILL.w / 2,
    y: shell.bottom - CORNER_GUTTER - CORNER_PILL.h / 2,
  };
}
