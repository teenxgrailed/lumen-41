"use client";

import type { CSSProperties, ReactNode } from "react";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import { StError } from "../states/StScreen";
import { type ScreenQuery, screenState } from "../states/status";

/**
 * What an Agents tab shows while its data is not there: a skeleton on the
 * first load, an error with Retry when it failed. Both live in the tab's own
 * body, in normal flow, so they have a height on every tab (the shared
 * `StScreen` layer is absolutely positioned and collapses inside the page).
 */
export type AgSkeletonKind = "map" | "cards" | "rows" | "chat";

/** One shimmer bar; the same `.st-sk` the other screens' skeletons use. */
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

const ROW_WIDTHS = [62, 48, 70, 54, 66, 44];

export function AgSkeleton({ kind }: { kind: AgSkeletonKind }) {
  let inner;
  if (kind === "cards") {
    inner = (
      <div className="ag-grid">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="ag-glass ag-sk-card">
            <span className="ag-sk-line">
              <Bar w={30} h={30} r={10} />
              <Bar w={96} h={12} />
            </span>
            <Bar w="86%" h={9} />
            <Bar w="58%" h={9} />
            <Bar w="100%" h={26} r={8} />
          </div>
        ))}
      </div>
    );
  } else if (kind === "map") {
    inner = (
      <div className="ag-sk-map">
        <Bar w={46} h={46} r={23} style={{ left: "12%", top: "22%" }} />
        <Bar w={46} h={46} r={23} style={{ left: "12%", top: "58%" }} />
        <Bar w={64} h={64} r={32} style={{ left: "44%", top: "40%" }} />
        <Bar w={46} h={46} r={23} style={{ left: "74%", top: "24%" }} />
        <Bar w={46} h={46} r={23} style={{ left: "70%", top: "62%" }} />
      </div>
    );
  } else if (kind === "chat") {
    inner = (
      <div className="ag-sk-chat">
        <Bar w="58%" h={34} r={14} style={{ alignSelf: "flex-end" }} />
        <Bar w="82%" h={9} />
        <Bar w="64%" h={9} />
        <Bar w="44%" h={34} r={14} style={{ alignSelf: "flex-end" }} />
      </div>
    );
  } else {
    inner = (
      <div className="ag-glass ag-sk-rows">
        {ROW_WIDTHS.map((w, i) => (
          <span key={i} className="ag-sk-row">
            <Bar w={22} h={22} r={11} />
            <Bar w={`${w}%`} h={11} />
            <Bar w={36} h={9} style={{ marginLeft: "auto" }} />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div
      className={`ag-sk is-${kind}`}
      data-ag-skeleton={kind}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {inner}
    </div>
  );
}

/** The text of a failed load, by what the tab shows. */
export function errorLine(what: string, offline: boolean) {
  return offline
    ? "You’re offline. Reconnect to load this."
    : `Couldn’t load ${what}. The server didn’t answer.`;
}

/** An error in the tab's body: what failed, and Retry. */
export function AgError({
  what,
  offline = false,
  onRetry,
}: {
  what: string;
  offline?: boolean;
  onRetry: () => unknown;
}) {
  return (
    <div className="ag-state-error" data-ag-error="">
      <StError text={errorLine(what, offline)} onRetry={onRetry} />
    </div>
  );
}

/**
 * Skeleton, error or the content, from one query. `what` names the tab for
 * the error line ("your tasks"). Cached data always wins, as in `StScreen`.
 */
export function AgLoad({
  query,
  kind,
  what,
  children,
}: {
  query: ScreenQuery;
  kind: AgSkeletonKind;
  what: string;
  children: ReactNode;
}) {
  const state = screenState(query);
  if (state === "loading") return <AgSkeleton kind={kind} />;
  if (state === "error" || state === "offline" || state === "no-access")
    return (
      <AgError
        what={what}
        offline={state === "offline"}
        onRetry={query.refetch}
      />
    );
  return <>{children}</>;
}
