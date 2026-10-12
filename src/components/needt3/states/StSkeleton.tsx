"use client";

import type { CSSProperties } from "react";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import strings from "../../../../docs/port/prototype/port/strings/en.json";

export type SkeletonKind =
  | "list"
  | "grid"
  | "doc"
  | "calendar"
  | "cards"
  | "chat";
const widths = [72, 54, 66, 48, 80, 58, 44, 62, 70, 52];

function Bar({
  w,
  h = 10,
  r = 5,
  style,
}: {
  w: number | string;
  h?: number;
  r?: number;
  style?: CSSProperties;
}) {
  const reduced = useNeedtReducedMotion();
  return (
    <span
      className="st-sk"
      style={{
        width: w,
        height: h,
        borderRadius: r,
        ...style,
        ...(reduced ? { animation: "none" } : {}),
      }}
    />
  );
}

export function StSkeleton({ kind = "list" }: { kind?: SkeletonKind }) {
  const cssKind = kind === "doc" ? "page" : kind === "calendar" ? "week" : kind;
  let inner;
  if (kind === "grid")
    inner = (
      <div className="st-sk-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="st-sk-card">
            <Bar w="100%" h={118} r={12} />
            <Bar w={`${widths[i]}%`} h={11} />
            <Bar w={38} h={9} />
          </div>
        ))}
      </div>
    );
  else if (kind === "calendar")
    inner = (
      <div className="st-sk-week">
        <div className="st-sk-week-gutter">
          {Array.from({ length: 9 }, (_, i) => (
            <Bar key={i} w={26} h={8} />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, d) => (
          <div key={d} className="st-sk-week-day">
            <Bar w={46} />
            <span className="st-sk-week-col">
              <Bar
                w="88%"
                h={[48, 72, 36, 90, 54, 30, 64][d]}
                r={8}
                style={{
                  position: "absolute",
                  top: [20, 90, 150, 40, 210, 120, 60][d],
                  left: 4,
                }}
              />
              {d % 2 ? (
                <Bar
                  w="88%"
                  h={40}
                  r={8}
                  style={{
                    position: "absolute",
                    top: [0, 260, 0, 230, 0, 300, 0][d],
                    left: 4,
                  }}
                />
              ) : null}
            </span>
          </div>
        ))}
      </div>
    );
  else if (kind === "doc")
    inner = (
      <div className="st-sk-page">
        <Bar w="58%" h={30} r={8} />
        <Bar w={140} style={{ marginBottom: 18 }} />
        {[96, 88, 92, 60, 0, 94, 82, 90, 48, 0, 86, 74].map((w, i) =>
          w ? (
            <Bar key={i} w={`${w}%`} h={12} />
          ) : (
            <span key={i} className="state-skeleton-span-2" />
          )
        )}
      </div>
    );
  else if (kind === "cards")
    inner = (
      <div className="st-sk-cards">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="st-sk-cardbox">
            <span className="state-skeleton-row">
              <Bar w={32} h={32} r={9} />
              <Bar w={96} h={12} />
            </span>
            <Bar w="86%" h={9} />
            <Bar w="64%" h={9} />
            <span className="state-skeleton-row-2">
              <Bar w={84} h={28} r={9} />
            </span>
          </div>
        ))}
      </div>
    );
  else if (kind === "chat")
    inner = (
      <div className="st-sk-chat">
        <Bar w="62%" h={34} r={14} style={{ alignSelf: "flex-end" }} />
        <span className="state-skeleton-row-3">
          <Bar w={20} h={20} r={6} />
          <span className="state-skeleton-stack">
            <Bar w="92%" />
            <Bar w="78%" />
            <Bar w="54%" />
          </span>
        </span>
        <Bar w="48%" h={34} r={14} style={{ alignSelf: "flex-end" }} />
        <span className="state-skeleton-row-3">
          <Bar w={20} h={20} r={6} />
          <span className="state-skeleton-stack">
            <Bar w="86%" />
            <Bar w="66%" />
          </span>
        </span>
      </div>
    );
  else
    inner = (
      <div className="st-sk-list">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="st-sk-row">
            <Bar w={16} h={16} r={5} />
            <Bar w={widths[i] * 4.2} h={11} />
            <span className="state-skeleton-span" />
            <Bar w={40} h={9} />
            {i % 3 ? <Bar w={64} h={20} r={6} /> : null}
          </div>
        ))}
      </div>
    );
  return (
    <div
      className={`st-skeleton is-${cssKind}`}
      aria-busy="true"
      aria-label={strings["states.jsx"].StSkeleton.loading}
      data-st-skeleton={cssKind}
    >
      {kind === "doc" || kind === "chat" ? null : (
        <div className="st-sk-head">
          <Bar w={168} h={18} r={6} />
          <span className="state-skeleton-span" />
          <Bar w={92} h={28} r={9} />
        </div>
      )}
      {inner}
    </div>
  );
}
