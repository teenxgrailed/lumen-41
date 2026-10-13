"use client";

import type { CSSProperties, ReactNode } from "react";

import type { ThemeSide } from "@/lib/needt3/theme";

/* THE MINIATURE (Miniature.jsx, kind "day"): a real screen of the product,
   drawn small. It is authored at full size (320 x 206, the sizes the product
   uses) and then scaled to the thumbnail, so what shrinks is a screen rather
   than a wireframe. Settings → Appearance is its only caller here, and the
   only kind it needs is the Home ("day") screen.

   Each side of a pair is a nested `.needt-v3` scope carrying its own
   `data-theme`, so the vendored theme blocks (`.needt-v3:is([data-theme=…])`)
   dress it exactly as they dress the real frame, whatever the frame wears.
   The classes are the vendored `docs-mi-*` set (styles/v3/docs.css). */

const MI_W = 320;
const MI_H = 206;

/* The prototype's `miHue(name)` read the demo projects' colours; these are
   the same four hue tokens, because the thumbnail is an illustration of the
   screen and not the person's own projects. */
const HUE = {
  Operations: "var(--hue-orange)",
  "Design system": "var(--hue-blue)",
  German: "var(--hue-violet)",
  Resale: "var(--hue-green)",
} as const;

function MiText({
  children,
  size = 10,
  weight = 400,
  ink = "var(--text-primary)",
}: {
  children: ReactNode;
  size?: number;
  weight?: number;
  ink?: string;
}) {
  return (
    <span
      className="docs-mi-mi-text-1"
      style={{
        font: `${weight} ${size}px/1.35 var(--font-sans)`,
        color: ink,
      }}
    >
      {children}
    </span>
  );
}

function MiTile({ hue, size = 14 }: { hue: string; size?: number }) {
  return (
    <span
      className="docs-mi-mi-tile-1"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: `linear-gradient(180deg, color-mix(in oklab, ${hue} 90%, white), color-mix(in oklab, ${hue} 96%, black))`,
      }}
    />
  );
}

function MiCard({
  title,
  meta,
  hue,
}: {
  title: string;
  meta: string;
  hue: string;
}) {
  return (
    <span className="docs-mi-mi-card-1">
      <MiTile hue={hue} size={13} />
      <span className="docs-mi-mi-card-2">
        <MiText size={9.5} weight={500}>
          {title}
        </MiText>
      </span>
      <MiText size={9} ink="var(--text-quaternary)">
        {meta}
      </MiText>
    </span>
  );
}

const RAIL_ROWS: readonly (readonly [string, boolean])[] = [
  ["Home", true],
  ["Calendar", false],
  ["Tasks", false],
  ["Docs", false],
];
const RAIL_PROJECTS = ["Operations", "Design system", "Resale"] as const;
const TABS = ["Today", "Prose", "Canvas"] as const;
const HABITS: readonly (readonly [string, boolean])[] = [
  ["German", true],
  ["Walk", true],
  ["Gym", false],
];
const CARDS: readonly (readonly [string, string, keyof typeof HUE])[] = [
  ["Draft the launch brief", "90m", "Operations"],
  ["Review the spec", "60m", "Design system"],
  ["German — unit 4", "60m", "German"],
  ["Ship the camera body", "45m", "Resale"],
];

function MiRail() {
  return (
    <span className="docs-mi-mi-rail-1">
      <span className="docs-mi-mi-rail-2">
        <span className="font-display docs-mi-mi-rail-3">Needt</span>
      </span>
      <span className="docs-mi-mi-rail-4">
        <MiText size={9} ink="var(--text-disabled)">
          Find
        </MiText>
      </span>
      {RAIL_ROWS.map(([label, on]) => (
        <span
          className={
            "docs-mi-mi-rail-5 docs-mi-mi-rail-s1" + (on ? " is-on" : "")
          }
          key={label}
        >
          <span
            className={
              "docs-mi-mi-rail-6 docs-mi-mi-rail-s2" + (on ? " is-on" : "")
            }
          />
          <MiText
            size={9}
            weight={on ? 500 : 400}
            ink={on ? "var(--accent)" : "var(--text-tertiary)"}
          >
            {label}
          </MiText>
        </span>
      ))}
      <span className="docs-mi-mi-rail-7">
        <MiText size={8} weight={500} ink="var(--text-quaternary)">
          PROJECTS
        </MiText>
      </span>
      {RAIL_PROJECTS.map((n) => (
        <span className="docs-mi-mi-rail-8" key={n}>
          <span className="docs-mi-mi-rail-9" style={{ background: HUE[n] }} />
          <MiText size={9} ink="var(--text-tertiary)">
            {n}
          </MiText>
        </span>
      ))}
    </span>
  );
}

function MiHeader() {
  return (
    <span className="docs-mi-mi-header-1">
      <MiText size={13} weight={600}>
        Home
      </MiText>
      <span className="docs-mi-mi-header-2">
        {TABS.map((t) => (
          <span
            className={
              "docs-mi-mi-header-3 docs-mi-mi-header-s1" +
              (t === "Today" ? " is-on" : "")
            }
            key={t}
          >
            <MiText
              size={8.5}
              weight={500}
              ink={t === "Today" ? "var(--accent)" : "var(--text-muted)"}
            >
              {t}
            </MiText>
          </span>
        ))}
      </span>
    </span>
  );
}

function MiDay() {
  return (
    <span className="docs-mi-mi-day-1">
      <span className="docs-mi-mi-day-2">
        {HABITS.map(([n, on]) => (
          <span className="docs-mi-mi-day-3" key={n}>
            <span
              className={
                "docs-mi-mi-day-4 docs-mi-mi-day-s1" + (on ? " is-on" : "")
              }
            />
            <MiText size={9}>{n}</MiText>
          </span>
        ))}
      </span>
      <span className="docs-mi-mi-day-5">
        <span className="docs-mi-mi-day-6">
          <MiText size={9} weight={500} ink="var(--accent)">
            Today
          </MiText>
          {CARDS.map(([title, meta, project]) => (
            <MiCard key={title} title={title} meta={meta} hue={HUE[project]} />
          ))}
        </span>
      </span>
    </span>
  );
}

/** The Time tile's sun / moon disc on the diagonal cut. */
function MiDayNight() {
  return (
    <span className="mi-diag-disc" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <g className="mi-diag-sun" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="8.6" cy="8.6" r="2.4" />
          <path d="M8.6 3.6v1.1M8.6 12.5v1.1M3.6 8.6h1.1M12.5 8.6h1.1M5.1 5.1l.8.8M11.3 11.3l.8.8M5.1 12.1l.8-.8M11.3 5.9l.8-.8" />
        </g>
        <path
          className="mi-diag-moon"
          d="M17.9 12.4a3.6 3.6 0 1 0 3.3 5.1 2.9 2.9 0 0 1-3.3-5.1Z"
        />
      </svg>
    </span>
  );
}

function MiAuto() {
  return (
    <span className="mi-diag-auto" aria-hidden="true">
      <svg width="7" height="7" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M6 3.6V6l1.6 1.1"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      Auto
    </span>
  );
}

/**
 * One theme's face. `theme` alone is a single side; `half` is System (cut down
 * the middle, light left); `diagonal` is Time (light top left, dark bottom
 * right, a sun / moon on the cut and an "Auto" clock in the dark corner).
 */
export function Miniature({
  width,
  accent,
  theme,
  half,
  diagonal,
}: {
  width: number;
  accent: string;
  theme?: ThemeSide;
  half?: readonly [ThemeSide, ThemeSide];
  diagonal?: readonly [ThemeSide, ThemeSide];
}) {
  const w = width;
  const h = Math.round(w * (MI_H / MI_W));
  const screen = (
    <span
      className="docs-mi-miniature-1"
      style={{ width: MI_W, height: MI_H, transform: `scale(${w / MI_W})` }}
    >
      <MiRail />
      <span className="docs-mi-miniature-2">
        <MiHeader />
        <MiDay />
      </span>
    </span>
  );
  const layer = (side: ThemeSide, className: string) => (
    <span
      className={`docs-mi-miniature-4 needt-v3 ${className}`}
      data-theme={side}
      data-accent={accent}
    >
      {screen}
    </span>
  );
  if (diagonal) {
    return (
      <span
        className="docs-mi-miniature-3 mi-diag"
        style={{ width: w, height: h }}
        aria-hidden="true"
      >
        {layer(diagonal[0], "mi-diag-a")}
        {layer(diagonal[1], "mi-diag-b")}
        <svg
          className="mi-diag-seam"
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            x1="100"
            y1="0"
            x2="0"
            y2="100"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <MiDayNight />
        <MiAuto />
      </span>
    );
  }
  if (half) {
    return (
      <span
        className="docs-mi-miniature-3"
        style={{ width: w, height: h }}
        aria-hidden="true"
      >
        {layer(half[0], "docs-mi-miniature-s1 is-on")}
        {layer(half[1], "docs-mi-miniature-s1")}
      </span>
    );
  }
  const single: CSSProperties = {
    position: "relative",
    display: "block",
    width: w,
    height: h,
    overflow: "hidden",
    borderRadius: "var(--radius-lg)",
    background: "var(--background)",
  };
  return (
    <span
      className="needt-v3"
      data-theme={theme ?? "light"}
      data-accent={accent}
      style={single}
      aria-hidden="true"
    >
      {screen}
    </span>
  );
}
