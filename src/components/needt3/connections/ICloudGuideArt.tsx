/**
 * Three schematic sketches of the Apple Account page, drawn from scratch: grey
 * boxes, the real labels as text, nothing copied from Apple. Colours come from
 * Needt tokens so they follow the light / dark theme; the accent appears only
 * as the small mark on the thing to select. Each is well under 6 KB.
 */
import type { ReactNode } from "react";

import { strings } from "./strings";

const FONT = "var(--font-sans, system-ui, sans-serif)";

function Frame({ alt, children }: { alt: string; children: ReactNode }) {
  return (
    <svg
      className="cn-guide-art"
      viewBox="0 0 320 96"
      role="img"
      aria-label={alt}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="0.5"
        y="0.5"
        width="319"
        height="95"
        rx="8"
        fill="var(--fill-1)"
        stroke="var(--border)"
      />
      <g fontFamily={FONT} fontSize="12">
        {children}
      </g>
    </svg>
  );
}

const Row = ({
  y,
  label,
  mark,
}: {
  y: number;
  label: string;
  mark?: boolean;
}) => (
  <g>
    <rect x="16" y={y} width="288" height="24" rx="6" fill="var(--fill-2)" />
    <text x="28" y={y + 16} fill="var(--text-secondary)">
      {label}
    </text>
    {mark ? <circle cx="290" cy={y + 12} r="3" fill="var(--accent)" /> : null}
  </g>
);

/** 1. The Sign-In and Security section, App-Specific Passwords marked. */
export function ArtSecurity() {
  return (
    <Frame alt={strings.guideAlt.security}>
      <text x="16" y="20" fill="var(--text-tertiary)">
        Sign-In and Security
      </text>
      <Row y={30} label="Email and Phone Numbers" />
      <Row y={60} label="App-Specific Passwords" mark />
    </Frame>
  );
}

/** 2. The App-Specific Passwords list with the generate control marked. */
export function ArtGenerate() {
  return (
    <Frame alt={strings.guideAlt.generate}>
      <text x="16" y="20" fill="var(--text-tertiary)">
        App-Specific Passwords
      </text>
      <Row y={30} label="Generate an app-specific password" mark />
      <rect x="16" y="64" width="150" height="8" rx="4" fill="var(--fill-3)" />
      <rect x="16" y="78" width="100" height="8" rx="4" fill="var(--fill-3)" />
    </Frame>
  );
}

/** 3. The generated password, in four groups. */
export function ArtPassword() {
  return (
    <Frame alt={strings.guideAlt.password}>
      <text x="16" y="20" fill="var(--text-tertiary)">
        Your app-specific password
      </text>
      <rect x="16" y="32" width="288" height="32" rx="6" fill="var(--fill-2)" />
      <text
        x="28"
        y="53"
        fill="var(--text-primary)"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        xxxx-xxxx-xxxx-xxxx
      </text>
      <circle cx="290" cy="48" r="3" fill="var(--accent)" />
      <text x="16" y="82" fill="var(--text-tertiary)">
        Copy it, then paste it into Needt.
      </text>
    </Frame>
  );
}
