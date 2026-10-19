/** The game's own 16px line icons (sg-game.jsx SG_I / SgI). */
const PATHS = {
  x: "M4 4l8 8M12 4l-8 8",
  mic: "M8 2.5a2 2 0 0 1 2 2V8a2 2 0 1 1-4 0V4.5a2 2 0 0 1 2-2zM4.5 8a3.5 3.5 0 0 0 7 0M8 11.5V14",
  arrow: "M3 8h9M9 4.5L12.5 8 9 11.5",
  check: "M3.5 8.5l3 3 6-7",
  undo: "M5 4.5L2.5 7 5 9.5M2.5 7H10a3.5 3.5 0 0 1 0 7H8",
  spark: "M8 2c.5 3 2 4.5 5 5-3 .5-4.5 2-5 5-.5-3-2-4.5-5-5 3-.5 4.5-2 5-5z",
  more: "M4 8h.01M8 8h.01M12 8h.01",
} as const;

export type SgIconName = keyof typeof PATHS;

export function SgIcon({ n, s = 16 }: { n: SgIconName; s?: number }) {
  const filled = n === "spark";
  return (
    <svg
      viewBox="0 0 16 16"
      width={s}
      height={s}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={n === "more" ? 2.6 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[n]} />
    </svg>
  );
}
