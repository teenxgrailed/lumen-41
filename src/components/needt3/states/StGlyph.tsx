import type { IconType } from "react-icons";
import { LuInfo } from "react-icons/lu";

/* The marks the state surfaces share (prototype states.jsx `StGlyph`, and the
   phone's `Mobile.jsx` MbStGlyph that wraps it). Drawn here so the phone and
   the desktop get the same lines: 24-unit box, 2px stroke, round caps. */
export const ST_PATHS: Readonly<Record<string, readonly string[]>> = {
  "cloud-off": [
    "m2 2 20 20",
    "M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.19",
    "M21.53 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 10 5.07",
  ],
  lock: [
    "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z",
    "M7 11V7a5 5 0 0 1 10 0v4",
  ],
  alert: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 8v4", "M12 16h.01"],
  refresh: [
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5",
  ],
  card: [
    "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
    "M2 10h20",
  ],
  phone: [
    "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
    "M12 18h.01",
  ],
  sparkles: [
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
    "M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z",
  ],
  "calendar-x": [
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M16 2v4",
    "M8 2v4",
    "M3 10h18",
    "m10 14 4 4",
    "m14 14-4 4",
  ],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  layers: ["M12 2 2 7l10 5 10-5-10-5z", "m2 17 10 5 10-5", "m2 12 10 5 10-5"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  diff: [
    "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M13 6h3a2 2 0 0 1 2 2v7",
    "M11 18H8a2 2 0 0 1-2-2V9",
  ],
};

export function StGlyph({
  name,
  size = 14,
  fallback: Fallback = LuInfo,
}: {
  name: string;
  size?: number;
  /** Drawn when `name` is not one of the shared marks (phone: "info"). */
  fallback?: IconType;
}) {
  const paths = ST_PATHS[name];
  if (!paths) return <Fallback size={size} aria-hidden />;
  return (
    <svg
      className="state-glyph-svg"
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d, k) => (
        <path key={k} d={d} />
      ))}
    </svg>
  );
}
