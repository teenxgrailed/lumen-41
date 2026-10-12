/* Ported from docs/port/prototype/Sidebar.jsx (PlaceGlyph): small filled
   duotone pictures in the token hues. They are marks, not chrome icons — the
   one place the currentColor rule bends. Places without a drawn mark use the
   rich-menu illustration at 24px. */
import type { ReactNode } from "react";

import { Art, VIOLET } from "../menu/Art";
import { placeById } from "./places";

const tint = (c: string, n?: number) =>
  "color-mix(in oklch, " + c + " " + (n || 22) + "%, transparent)";

export function PlaceGlyph({ id }: { id: string }) {
  const A = "var(--accent)",
    I = "var(--info)",
    S = "var(--success)",
    D = "var(--destructive)",
    V = VIOLET,
    W = "var(--surface-raised)",
    R = "var(--border)";
  const marks: Record<string, ReactNode> = {
    today: (
      <g>
        <path
          d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"
          fill={tint(A, 26)}
        />
        <path
          d="M2.6 11.6 12 3.6l9.4 8"
          fill="none"
          stroke={A}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="9.6" y="13.5" width="4.8" height="7" rx="1.2" fill={A} />
      </g>
    ),
    projects: (
      <g>
        <rect
          x="6"
          y="3"
          width="15"
          height="11.5"
          rx="2.4"
          fill={tint(V, 30)}
        />
        <rect x="3" y="8" width="15" height="12.5" rx="2.4" fill={V} />
        <rect x="6" y="12" width="7" height="1.8" rx=".9" fill={W} />
        <rect
          x="6"
          y="15.6"
          width="9"
          height="1.8"
          rx=".9"
          fill={W}
          opacity=".7"
        />
      </g>
    ),
    tasks: (
      <g>
        <rect x="3" y="3" width="18" height="18" rx="4.5" fill={A} />
        <path
          d="M7.6 12.3l3 3 5.8-6.4"
          fill="none"
          stroke={W}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
    boards: (
      <g>
        <rect
          x="2.5"
          y="3.5"
          width="5.6"
          height="17"
          rx="1.8"
          fill={tint(I, 30)}
        />
        <rect x="9.2" y="3.5" width="5.6" height="12" rx="1.8" fill={I} />
        <rect
          x="15.9"
          y="3.5"
          width="5.6"
          height="8"
          rx="1.8"
          fill={tint(I, 55)}
        />
      </g>
    ),
    moodboards: (
      <g>
        <rect x="2.5" y="3" width="9" height="11" rx="2" fill={tint(D, 70)} />
        <rect
          x="2.5"
          y="15.5"
          width="9"
          height="5.5"
          rx="2"
          fill={tint(A, 40)}
        />
        <rect x="12.8" y="3" width="8.7" height="6" rx="2" fill={tint(S, 60)} />
        <rect
          x="12.8"
          y="10.5"
          width="8.7"
          height="10.5"
          rx="2"
          fill={tint("var(--text-primary)", 22)}
        />
      </g>
    ),
    calendar: (
      <g>
        <rect
          x="3"
          y="4"
          width="18"
          height="17"
          rx="3"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <path d="M6 4h12a3 3 0 0 1 3 3v2H3V7a3 3 0 0 1 3-3z" fill={D} />
        <text
          x="12"
          y="18.4"
          textAnchor="middle"
          fontSize="8.6"
          fontWeight="600"
          fontFamily="Inter, system-ui, sans-serif"
          fill="var(--text-primary)"
        >
          6
        </text>
      </g>
    ),
    mail: (
      <g>
        <rect x="2.5" y="5" width="19" height="14" rx="2.6" fill={I} />
        <path
          d="M3.6 6.6 12 12.8l8.4-6.2"
          fill="none"
          stroke={W}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
    docs: (
      <g>
        <path
          d="M6 2.8h8.2L19 7.6V19.6A1.6 1.6 0 0 1 17.4 21.2H6A1.6 1.6 0 0 1 4.4 19.6V4.4A1.6 1.6 0 0 1 6 2.8z"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <path d="M14.2 2.8v4.8H19" fill={tint("var(--text-primary)", 8)} />
        <rect x="7" y="10" width="8.5" height="1.9" rx=".95" fill={A} />
        <rect x="7" y="13.6" width="6" height="1.9" rx=".95" fill={S} />
        <rect x="7" y="17.2" width="7.4" height="1.9" rx=".95" fill={I} />
      </g>
    ),
    new: (
      <g>
        <circle cx="12" cy="12" r="9" fill={tint("var(--text-primary)", 7)} />
        <path
          d="M12 7.8v8.4M7.8 12h8.4"
          stroke="var(--text-secondary)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    ),
    more: (
      <g>
        {(
          [
            [A, 5, 7],
            [D, 12, 7],
            [I, 19, 7],
            [S, 5, 15],
            ["var(--text-tertiary)", 12, 15],
            [tint(A, 60), 19, 15],
          ] as [string, number, number][]
        ).map(([c, x, y], i) => (
          <circle key={i} cx={x} cy={y + 1} r="3" fill={c} />
        ))}
      </g>
    ),
  };
  const g = marks[id];
  if (!g) {
    const p = placeById(id);
    return <Art name={p ? p.art : "page"} size={24} />;
  }
  return (
    <svg
      className="shell-place-glyph-svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {g}
    </svg>
  );
}
