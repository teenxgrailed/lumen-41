/* Ported from docs/port/prototype/popovers.jsx (Art): flat illustrations in
   the token hues for rich menus and the ⌘K palette. No images, no gradients;
   depth comes from a second tone of the same hue. */
import type { ReactNode } from "react";

export const VIOLET = "oklch(0.62 0.19 300)";
const mix = (c: string, n: number, base?: string) =>
  "color-mix(in oklch, " +
  c +
  " " +
  n +
  "%, " +
  (base || "var(--surface-raised)") +
  ")";

export type ArtName =
  | "doc"
  | "folder"
  | "template"
  | "tune"
  | "task"
  | "event"
  | "habit"
  | "import"
  | "markdown"
  | "calendarfile"
  | "sheet"
  | "later"
  | "page"
  | "stack"
  | "gdoc"
  | "home"
  | "work"
  | "mail"
  | "trash"
  | "focus";

export function Art({ name, size }: { name: ArtName; size?: number }) {
  const z = size || 40;
  const A = "var(--accent)",
    I = "var(--info)",
    S = "var(--success)",
    D = "var(--destructive)",
    W = "var(--surface-raised)",
    R = "var(--border)";
  const art: Record<ArtName, ReactNode> = {
    doc: (
      <g>
        <path
          d="M11 5h13l8 8v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <path
          d="M24 5v6a2 2 0 0 0 2 2h6z"
          fill="color-mix(in oklab, var(--text-primary) 6%, transparent)"
        />
        <rect
          x="13"
          y="19"
          width="5"
          height="2.4"
          rx="1.2"
          fill="color-mix(in oklab, var(--text-primary) 16%, transparent)"
        />
        <rect
          x="20"
          y="19"
          width="5"
          height="2.4"
          rx="1.2"
          fill="color-mix(in oklab, var(--text-primary) 16%, transparent)"
        />
        <rect
          x="13"
          y="24"
          width="12"
          height="2.4"
          rx="1.2"
          fill="color-mix(in oklab, var(--text-primary) 12%, transparent)"
        />
      </g>
    ),
    folder: (
      <g>
        <path
          d="M5 11a3 3 0 0 1 3-3h7l3 3h14a3 3 0 0 1 3 3v15H5z"
          fill={mix(A, 70, "black")}
        />
        <rect x="5" y="15" width="30" height="19" rx="3.5" fill={mix(A, 45)} />
        <rect x="5" y="15" width="30" height="5" rx="2.5" fill={mix(A, 60)} />
      </g>
    ),
    template: (
      <g>
        <path
          d="M9 33 24 15"
          stroke={mix(VIOLET, 70, "black")}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M27 6.5l1.9 4.3 4.6.5-3.5 3.1 1 4.6-4-2.4-4 2.4 1-4.6-3.5-3.1 4.6-.5z"
          fill={mix(VIOLET, 75)}
          stroke={VIOLET}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M9 9l.9 2.1 2.1.9-2.1.9L9 15l-.9-2.1L6 12l2.1-.9z"
          fill={mix("oklch(0.76 0.15 70)", 80)}
        />
        <path
          d="M32 26l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"
          fill={mix("oklch(0.76 0.15 70)", 80)}
        />
      </g>
    ),
    tune: (
      <g>
        <rect
          x="5"
          y="7"
          width="30"
          height="26"
          rx="6"
          fill={mix("var(--text-primary)", 8)}
        />
        {[
          [13, 15, 23],
          [20, 25, 14],
          [27, 15, 19],
        ].map(([y, , k], i) => (
          <g key={i}>
            <rect
              x="10"
              y={y - 1.2}
              width="20"
              height="2.4"
              rx="1.2"
              fill={mix("var(--text-primary)", 22)}
            />
            <circle
              cx={k}
              cy={y}
              r="3.2"
              fill={W}
              stroke="var(--text-secondary)"
              strokeWidth="1.6"
            />
          </g>
        ))}
      </g>
    ),
    task: (
      <g>
        <rect x="6" y="6" width="28" height="28" rx="8" fill={mix(A, 30)} />
        <rect x="9" y="9" width="22" height="22" rx="6" fill={A} />
        <path
          d="M14.5 20.5l4 4 7.5-8.5"
          fill="none"
          stroke={W}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
    event: (
      <g>
        <rect
          x="6"
          y="7"
          width="28"
          height="27"
          rx="5"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <path d="M11 7h18a5 5 0 0 1 5 5v2H6v-2a5 5 0 0 1 5-5z" fill={D} />
        <rect x="11" y="19" width="18" height="8" rx="2.5" fill={mix(A, 25)} />
        <rect x="11" y="19" width="2.5" height="8" rx="1.2" fill={A} />
      </g>
    ),
    habit: (
      <g>
        <circle cx="20" cy="20" r="14" fill={mix(S, 22)} />
        <path
          d="M27.5 15A9 9 0 1 0 29 22"
          fill="none"
          stroke={S}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M24 13.6l4.4 1.5L29.6 10"
          fill="none"
          stroke={S}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
    import: (
      <g>
        <path
          d="M6 22h7l2 4h10l2-4h7v8a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"
          fill={I}
        />
        <path
          d="M6 22l4-11a3 3 0 0 1 2.8-2h14.4a3 3 0 0 1 2.8 2l4 11h-7l-2 4H15l-2-4z"
          fill={mix(I, 40)}
        />
        <path
          d="M20 8v11m-4.5-4.5L20 19l4.5-4.5"
          fill="none"
          stroke={mix(I, 60, "black")}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
    markdown: (
      <g>
        <rect
          x="4"
          y="9"
          width="32"
          height="22"
          rx="5"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <path
          d="M10 25v-10l4 5 4-5v10"
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M27 15v9m-3.5-3.5L27 24l3.5-3.5"
          fill="none"
          stroke={A}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
    calendarfile: (
      <g>
        <path
          d="M11 5h13l8 8v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <rect x="12" y="17" width="16" height="13" rx="3" fill={mix(D, 18)} />
        <rect x="12" y="17" width="16" height="4" rx="2" fill={D} />
        <text
          x="20"
          y="28.4"
          textAnchor="middle"
          fontSize="6.5"
          fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif"
          fill="var(--text-primary)"
        >
          ICS
        </text>
      </g>
    ),
    sheet: (
      <g>
        <rect
          x="7"
          y="6"
          width="26"
          height="28"
          rx="5"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <rect x="7" y="6" width="26" height="7" rx="3" fill={mix(I, 75)} />
        {[17, 22, 27].map((y) => (
          <rect
            key={y}
            x="11"
            y={y}
            width="18"
            height="2.4"
            rx="1.2"
            fill="color-mix(in oklab, var(--text-primary) 12%, transparent)"
          />
        ))}
        <rect
          x="18.5"
          y="15"
          width="1.4"
          height="16"
          fill="color-mix(in oklab, var(--text-primary) 10%, transparent)"
        />
      </g>
    ),
    later: (
      <g>
        <rect x="5" y="9" width="30" height="23" rx="5" fill={mix(I, 30)} />
        <rect x="5" y="9" width="30" height="8" rx="4" fill={I} />
        <rect x="10" y="21" width="20" height="3" rx="1.5" fill={W} />
        <rect
          x="10"
          y="26"
          width="13"
          height="3"
          rx="1.5"
          fill={W}
          opacity=".7"
        />
      </g>
    ),
    page: (
      <g>
        <rect
          x="8"
          y="5"
          width="24"
          height="30"
          rx="4"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <rect
          x="12"
          y="11"
          width="11"
          height="3"
          rx="1.5"
          fill="var(--text-secondary)"
        />
        {[17, 21, 25].map((y, i) => (
          <rect
            key={y}
            x="12"
            y={y}
            width={[16, 13, 15][i]}
            height="2.2"
            rx="1.1"
            fill={[A, S, I][i]}
          />
        ))}
      </g>
    ),
    stack: (
      <g>
        <rect
          x="11"
          y="5"
          width="22"
          height="26"
          rx="4"
          fill={mix("var(--text-primary)", 10)}
        />
        <rect
          x="7"
          y="9"
          width="22"
          height="26"
          rx="4"
          fill={W}
          stroke={R}
          strokeWidth="1"
        />
        <rect
          x="11"
          y="15"
          width="10"
          height="3"
          rx="1.5"
          fill="var(--text-secondary)"
        />
        <rect
          x="11"
          y="21"
          width="14"
          height="2.2"
          rx="1.1"
          fill="color-mix(in oklab, var(--text-primary) 14%, transparent)"
        />
        <rect
          x="11"
          y="26"
          width="11"
          height="2.2"
          rx="1.1"
          fill="color-mix(in oklab, var(--text-primary) 14%, transparent)"
        />
      </g>
    ),
    gdoc: (
      <g>
        <path
          d="M11 5h13l8 8v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"
          fill={mix(A, 80)}
        />
        <path d="M24 5v6a2 2 0 0 0 2 2h6z" fill={mix(A, 50)} />
        {[19, 23, 27].map((y, i) => (
          <rect
            key={y}
            x="13"
            y={y}
            width={[14, 14, 9][i]}
            height="2.4"
            rx="1.2"
            fill={W}
          />
        ))}
      </g>
    ),
    home: (
      <g>
        <path
          d="M8 18.5 20 8.5l12 10V31a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z"
          fill={mix(A, 30)}
        />
        <path
          d="M5.5 19.5 20 7l14.5 12.5"
          fill="none"
          stroke={A}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="16" y="22" width="8" height="12" rx="2" fill={A} />
      </g>
    ),
    work: (
      <g>
        <rect
          x="11"
          y="6"
          width="24"
          height="18"
          rx="4"
          fill={mix(VIOLET, 35)}
        />
        <rect x="5" y="13" width="25" height="21" rx="4.5" fill={VIOLET} />
        <rect x="10" y="20" width="11" height="3" rx="1.5" fill={W} />
        <rect
          x="10"
          y="26"
          width="15"
          height="3"
          rx="1.5"
          fill={W}
          opacity=".7"
        />
      </g>
    ),
    mail: (
      <g>
        <rect x="4" y="9" width="32" height="23" rx="4.5" fill={I} />
        <path
          d="M6 11.5 20 22l14-10.5"
          fill="none"
          stroke={W}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
    trash: (
      <g>
        <rect
          x="9"
          y="12"
          width="22"
          height="23"
          rx="4"
          fill={mix("var(--text-primary)", 14)}
        />
        <rect
          x="6"
          y="8"
          width="28"
          height="5"
          rx="2.5"
          fill={mix("var(--text-primary)", 35)}
        />
        <rect
          x="16"
          y="5"
          width="8"
          height="4"
          rx="2"
          fill={mix("var(--text-primary)", 35)}
        />
        {[15, 20, 25].map((x) => (
          <rect
            key={x}
            x={x - 1}
            y="17"
            width="2.4"
            height="13"
            rx="1.2"
            fill={mix("var(--text-primary)", 40)}
          />
        ))}
      </g>
    ),
    focus: (
      <g>
        <circle cx="20" cy="20" r="14" fill={mix(D, 22)} />
        <circle cx="20" cy="20" r="9.5" fill={W} />
        <circle cx="20" cy="20" r="5" fill={D} />
      </g>
    ),
  };
  const g = art[name];
  return (
    <svg
      className="shell-place-glyph-svg"
      width={z}
      height={z}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      {g}
    </svg>
  );
}
