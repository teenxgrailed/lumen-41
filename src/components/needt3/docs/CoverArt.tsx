"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";

import { COVER_MOTIF, type CoverArtId } from "./style";

const W = 800;
const H = 220;

/** Reads `--doc-theme-*` tokens off the `.needt-v3` scope (empty until mounted). */
function useCoverTokens() {
  const [read, setRead] = useState<(name: string) => string>(() => () => "");
  useEffect(() => {
    const el = document.querySelector(".needt-v3");
    if (!el) return;
    const css = getComputedStyle(el);
    setRead(() => (name: string) => css.getPropertyValue(name).trim());
  }, []);
  return read;
}

/** The shapes of one art, from the theme's five colours (doc-style.jsx `DtCover`). */
function shapes(motif: string, c: string[]): ReactNode {
  const [, c1, c2, c3, c4] = c;
  switch (motif) {
    case "grid":
      return (
        <>
          {Array.from({ length: 10 }, (_, i) =>
            [0, 1, 2].map((j) => (
              <rect
                key={`${i}-${j}`}
                x={60 + i * 72}
                y={36 + j * 56}
                width={44}
                height={36}
                rx={10}
                fill={(i + j) % 3 ? c3 : c2}
                opacity={(i * 7 + j * 3) % 5 === 0 ? 0.95 : 0.45}
              />
            ))
          )}
          <circle cx={640} cy={110} r={54} fill={c4} opacity={0.55} />
        </>
      );
    case "arches":
      return (
        <>
          {(
            [
              [170, 210, c2],
              [170, 150, c3],
              [170, 92, c4],
              [560, 170, c4],
              [560, 112, c3],
              [560, 58, c2],
            ] as const
          ).map(([x, r, f], i) => (
            <path
              key={i}
              d={`M${x - r} 220 A${r} ${r} 0 0 1 ${x + r} 220 Z`}
              fill={f}
              opacity={0.85}
            />
          ))}
          <circle cx={380} cy={70} r={22} fill={c4} opacity={0.7} />
        </>
      );
    case "lines":
      return (
        <>
          {Array.from({ length: 22 }, (_, i) => (
            <line
              key={i}
              x1={i * 44 - 120}
              y1={240}
              x2={i * 44 + 80}
              y2={-20}
              stroke={c2}
              strokeWidth={i % 4 ? 1.5 : 5}
              opacity={i % 4 ? 0.35 : 0.6}
            />
          ))}
          <circle
            cx={600}
            cy={110}
            r={64}
            fill="none"
            stroke={c3}
            strokeWidth={3}
            opacity={0.9}
          />
          <circle cx={600} cy={110} r={30} fill={c4} opacity={0.85} />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx={590} cy={118} r={78} fill={c2} />
          <circle
            cx={590}
            cy={118}
            r={112}
            fill="none"
            stroke={c4}
            strokeWidth={2}
            opacity={0.45}
          />
          <path
            d="M0 170 C 120 120, 260 140, 380 165 S 640 200, 800 150 V220 H0 Z"
            fill={c3}
            opacity={0.8}
          />
          <path
            d="M0 200 C 160 170, 300 190, 460 200 S 700 185, 800 195 V220 H0 Z"
            fill={c3}
          />
          <circle cx={160} cy={70} r={10} fill={c4} opacity={0.9} />
        </>
      );
    case "hills":
      return (
        <>
          <circle cx={180} cy={70} r={34} fill={c3} />
          <path
            d="M0 150 C 140 90, 280 100, 420 150 S 680 120, 800 100 V220 H0 Z"
            fill={c1}
          />
          <path
            d="M0 185 C 180 140, 330 160, 500 190 S 720 150, 800 160 V220 H0 Z"
            fill={c2}
          />
          <path d="M0 210 C 200 190, 420 200, 800 196 V220 H0 Z" fill={c4} />
        </>
      );
    case "waves":
      return (
        <>
          {(
            [
              [110, c1, 0.7],
              [140, c2, 0.8],
              [172, c4, 0.9],
            ] as const
          ).map(([y, f, o], i) => (
            <path
              key={i}
              d={`M0 ${y} C 100 ${y - 30}, 200 ${y + 30}, 300 ${y} S 500 ${y - 30}, 600 ${y} S 800 ${y + 30}, 800 ${y} V220 H0 Z`}
              fill={f}
              opacity={o}
            />
          ))}
          <circle cx={660} cy={56} r={20} fill={c3} />
        </>
      );
    case "dunes":
      return (
        <>
          <circle cx={620} cy={78} r={42} fill={c3} />
          <path d="M0 160 Q 200 100, 420 160 T 800 140 V220 H0 Z" fill={c1} />
          <path d="M0 190 Q 260 140, 520 190 T 800 180 V220 H0 Z" fill={c2} />
          <path
            d="M0 212 Q 300 190, 800 208 V220 H0 Z"
            fill={c4}
            opacity={0.85}
          />
        </>
      );
    default:
      return (
        <>
          {Array.from({ length: 46 }, (_, i) => (
            <circle
              key={i}
              cx={(i * 137) % 800}
              cy={((i * 61) % 200) + 8}
              r={i % 7 ? 1.4 : 2.6}
              fill={c3}
              opacity={i % 3 ? 0.55 : 0.95}
            />
          ))}
          <circle
            cx={600}
            cy={100}
            r={64}
            fill="none"
            stroke={c2}
            strokeWidth={2}
            opacity={0.6}
          />
          <circle cx={600} cy={100} r={42} fill={c4} />
          <circle cx={620} cy={88} r={40} fill={c1} />
        </>
      );
  }
}

/**
 * A drawn cover: an abstract picture from one theme's five colours, read from
 * the `--doc-theme-<id>-cv1..5` tokens, so it follows the palette (no image
 * file). Stored as `art:<id>` in the page's `coverUrl`.
 */
export function CoverArt({
  id,
  style,
}: {
  id: CoverArtId;
  style?: CSSProperties;
}) {
  const read = useCoverTokens();
  const gradient = `dtc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const colours = [1, 2, 3, 4, 5].map((n) => read(`--doc-theme-${id}-cv${n}`));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="docs-fill"
      data-cover-art={id}
      style={style}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colours[0]} />
          <stop offset="1" stopColor={colours[1]} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${gradient})`} />
      {shapes(COVER_MOTIF[id], colours)}
    </svg>
  );
}
