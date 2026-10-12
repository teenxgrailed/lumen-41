"use client";

import type { ReactNode } from "react";

import { DcMiniPage, useDocTokens } from "../docs/DocParts";
import { backdropVars } from "../docs/backdrop";
import { type StyledDoc, styleOf } from "../docs/style";
import { GlassCard, PxSky } from "../scenes";

/** One of the place's own pages, drawn small on frosted glass. */
export interface PlPrint {
  id: string;
  title: string;
  /** The line under the print. */
  caption: string;
  doc: StyledDoc;
  onOpen: () => void;
}

/** Left offset and top of each print in the stack (places.jsx `at`). */
const AT = [
  [0, 34],
  [112, 16],
  [224, 44],
] as const;

const PRINT_W = 96;
const PRINT_H = 118;

function PrintPage({ print }: { print: PlPrint }) {
  const read = useDocTokens();
  const s = styleOf(print.doc);
  const bd = s.backdrop !== "none";
  const pad = bd ? Math.max(2, Math.round(PRINT_W / 9)) : 0;
  return (
    <span
      aria-hidden="true"
      className={"docs-thumb" + (bd ? " dc-bd" : "")}
      style={{
        width: PRINT_W,
        height: PRINT_H,
        borderRadius: Math.round(PRINT_W / 5),
        padding: bd ? `${pad}px ${pad}px 0` : 0,
        ...(bd ? backdropVars(s.backdrop, read) : null),
      }}
    >
      <DcMiniPage
        s={s}
        read={read}
        title={print.title}
        pad={8}
        radius={bd ? 8 : 0}
        lines={[86, 70, 78, 60]}
      />
    </span>
  );
}

/**
 * Templates and Shared open on a short painted-sky banner (places.jsx
 * `PlSceneHeader`): the kicker, the title in Exposure, the meta line, and up
 * to three of the place's own pages on frosted glass. The grid below is
 * unchanged. The prints go away under 900 px (app.css).
 */
export function PlSceneHeader({
  variant,
  kicker,
  title,
  meta,
  prints,
  actions,
}: {
  variant: "a" | "b" | "c" | "d";
  kicker: string;
  title: string;
  meta?: ReactNode;
  prints: readonly PlPrint[];
  actions?: ReactNode;
}) {
  return (
    <header
      className="pl-scene nx-swap pl-scene-header-header"
      data-pl-scene={variant}
    >
      <PxSky variant={variant} radius={20} intensity={1.4}>
        <div className="pl-scene-header-abs">
          <div data-px-calm="" className="pl-scene-header-col">
            <span className="px-kicker">{kicker}</span>
            <span className="pl-scene-header-row">
              <h1 className="px-display px-on-sky pl-scene-header-text">
                {title}
              </h1>
            </span>
            <span className="pl-scene-header-row-2">
              {meta ? (
                <span className="px-on-sky pl-scene-header-text-2">{meta}</span>
              ) : null}
              {actions}
            </span>
          </div>
          <div
            className="pl-scene-prints pl-scene-header-abs-2"
            aria-label={`From ${title}`}
          >
            {prints.slice(0, 3).map((pr, i) => (
              <GlassCard
                key={pr.id}
                className="pl-thumb"
                pad={6}
                radius={16}
                caption={pr.caption}
                onClick={pr.onOpen}
                label={`Open ${pr.title || "Untitled"}`}
                style={{
                  position: "absolute",
                  left: AT[i][0],
                  top: AT[i][1],
                  zIndex: i === 1 ? 2 : 1,
                }}
              >
                <span className="pl-scene-header-el">
                  <PrintPage print={pr} />
                </span>
              </GlassCard>
            ))}
          </div>
        </div>
      </PxSky>
    </header>
  );
}
