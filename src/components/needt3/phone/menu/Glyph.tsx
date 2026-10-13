import { PlaceGlyph } from "../../shell/PlaceGlyph";
import { type MenuPlaceId, menuGlyphId } from "./places";

const tint = (c: string, n: number) =>
  `color-mix(in oklch, ${c} ${n}%, transparent)`;

/**
 * The marks the desktop rail has no drawing for (prototype nav-a.jsx
 * `NvaOwnGlyph`), drawn the PlaceGlyph way: flat duotone in the token hues,
 * a 24-unit box. Ink and edge come from the menu's own tokens, so they read
 * right on the card in either theme. Ask Needt is a still orb (the live orb is
 * not ported; nothing animates at rest).
 */
function OwnGlyph({ id }: { id: MenuPlaceId }) {
  const A = "var(--nva-ink)";
  const W = "var(--nva-raise-2)";
  const R = "var(--nva-line)";
  const I = "var(--info)";
  const S = "var(--success)";
  const D = "var(--destructive)";
  const svg = (children: React.ReactNode) => (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
  switch (id) {
    case "ask":
      return svg(
        <>
          <circle cx="12" cy="12" r="9.4" fill="var(--orb-tile)" />
          <circle cx="12" cy="12" r="7.2" fill="var(--orb-glow)" />
          <circle
            cx="12"
            cy="12"
            r="9.4"
            fill="none"
            stroke="var(--orb-rim)"
            strokeWidth="1.2"
          />
          <circle cx="9.2" cy="9" r="1.9" fill="var(--orb-spec)" />
        </>
      );
    case "templates":
      // a page with a dashed copy behind it
      return svg(
        <>
          <rect
            x="8"
            y="2.8"
            width="13"
            height="15.4"
            rx="2"
            fill="none"
            stroke={tint("var(--accent)", 70)}
            strokeWidth="1.4"
            strokeDasharray="2.4 2"
          />
          <rect
            x="3"
            y="6"
            width="13"
            height="15.4"
            rx="2"
            fill={W}
            stroke={R}
            strokeWidth="1"
          />
          <rect
            x="5.6"
            y="9.6"
            width="7.8"
            height="1.9"
            rx=".95"
            fill="var(--accent)"
          />
          <rect
            x="5.6"
            y="13.2"
            width="5.4"
            height="1.9"
            rx=".95"
            fill={tint(A, 30)}
          />
          <rect
            x="5.6"
            y="16.8"
            width="6.6"
            height="1.9"
            rx=".95"
            fill={tint(A, 30)}
          />
        </>
      );
    case "shared":
      // two people
      return svg(
        <>
          <circle cx="16" cy="8" r="3.4" fill={tint(S, 55)} />
          <path d="M10.6 20.5a5.4 5.4 0 0 1 10.8 0z" fill={tint(S, 45)} />
          <circle cx="9" cy="8.6" r="3.8" fill={I} />
          <path d="M2.6 20.5a6.4 6.4 0 0 1 12.8 0z" fill={I} />
        </>
      );
    case "trash":
      return svg(
        <>
          <path
            d="M5.4 7.5h13.2l-1.1 12.3a1.6 1.6 0 0 1-1.6 1.5H8.1a1.6 1.6 0 0 1-1.6-1.5z"
            fill={tint(D, 22)}
          />
          <rect x="3.6" y="4.6" width="16.8" height="2.6" rx="1.3" fill={D} />
          <rect x="9.6" y="2.6" width="4.8" height="2.6" rx="1.1" fill={D} />
          <rect x="9.2" y="10.4" width="1.8" height="7.6" rx=".9" fill={D} />
          <rect x="13" y="10.4" width="1.8" height="7.6" rx=".9" fill={D} />
        </>
      );
    case "connections":
      return svg(
        <>
          <rect
            x="2.5"
            y="6.5"
            width="11"
            height="11"
            rx="5.5"
            fill={tint(I, 35)}
          />
          <rect
            x="10.5"
            y="6.5"
            width="11"
            height="11"
            rx="5.5"
            fill={tint(S, 45)}
          />
          <circle cx="8" cy="12" r="3" fill={I} />
          <circle cx="16" cy="12" r="3" fill={S} />
        </>
      );
    default:
      // settings: three sliders
      return svg(
        <>
          {(
            [
              [6, 9],
              [12, 15],
              [18, 7],
            ] as const
          ).map(([x, k], i) => (
            <g key={x}>
              <rect
                x={x - 1.1}
                y="3"
                width="2.2"
                height="18"
                rx="1.1"
                fill={tint(A, 22)}
              />
              <rect
                x={x - 3.2}
                y={k - 2.2}
                width="6.4"
                height="4.4"
                rx="2.2"
                fill={i === 1 ? "var(--accent)" : A}
              />
            </g>
          ))}
        </>
      );
  }
}

/** A place's mark: the rail's drawing where it has one, else the menu's own. */
export function MenuGlyph({ id }: { id: MenuPlaceId }) {
  const shellId = menuGlyphId(id);
  return (
    <span className="nva-glyph" aria-hidden="true">
      {shellId ? <PlaceGlyph id={shellId} /> : <OwnGlyph id={id} />}
    </span>
  );
}
