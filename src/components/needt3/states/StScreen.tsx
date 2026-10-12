"use client";

import type { ReactNode } from "react";

import { FiCloudOff, FiLock, FiRefreshCw } from "react-icons/fi";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { useDesignV3 } from "../root/V3Root";
import { type SkeletonKind, StSkeleton } from "./StSkeleton";
import {
  SCREEN_KIND,
  type ScreenQuery,
  errorText,
  screenState,
} from "./status";

const copy = strings["states.jsx"];

export function StError({
  text = errorText(),
  onRetry,
}: {
  text?: string;
  onRetry: () => unknown;
}) {
  return (
    <div className="st-error" role="alert" data-st-error>
      <span className="st-error-icon">
        <FiCloudOff size={16} aria-hidden />
      </span>
      <span className="st-error-text">{text}</span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary nx-btn-sm"
        data-st-retry
        onClick={() => void onRetry()}
      >
        <FiRefreshCw size={13} aria-hidden />
        {copy.StError.retry}
      </button>
    </div>
  );
}

export function StNoAccess({
  title,
  kind = "document",
  owner,
}: {
  title?: string;
  kind?: string;
  owner?: { name: string; email: string };
}) {
  return (
    <div className="st-noaccess" role="alert" data-st-noaccess>
      <span className="st-noaccess-lock">
        <FiLock size={18} aria-hidden />
      </span>
      <span className="st-noaccess-title">
        You don&apos;t have access
        {title ? ` to “${title}”` : ` to this ${kind}`}
      </span>
      <span className="st-noaccess-body">
        {copy.StNoAccess.this} {kind}{" "}
        {copy.StNoAccess.was_shared_with_a_link_but_not_with_your}
      </span>
      {owner ? (
        <span className="st-noaccess-owner">
          <span
            className="st-avatar"
            style={{ width: 28, height: 28, fontSize: 12 }}
          >
            {owner.name
              .split(/\s+/)
              .map((word) => word[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <span className="state-no-access-stack">
            <span className="base-strong">{owner.name}</span>
            <span className="base-meta">
              {copy.StNoAccess.owner} {owner.email}
            </span>
          </span>
        </span>
      ) : null}
      {/* //todo "Request access" button: no access-request API exists yet;
          the prototype's button is a mock, so it is not ported. */}
    </div>
  );
}

export function PlEmpty({
  art,
  title,
  line,
  action,
}: {
  art: ReactNode;
  title: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="pl-empty pl-empty-col">
      {art}
      <span className="pl-empty-text">{title}</span>
      <span className="pl-line">{line}</span>
      {action ? <span className="pl-empty-text-3">{action}</span> : null}
    </div>
  );
}

export interface StScreenProps {
  query: ScreenQuery;
  /** Skeleton shape; defaults to the screen's kind in `SCREEN_KIND`. */
  kind?: SkeletonKind;
  /** Screen name (states.jsx `ST_WHAT` keys) for the error text and layer id. */
  screen?: string;
  children: ReactNode;
  errorText?: string;
  title?: string;
}

/**
 * Wraps a screen body and replaces it with the matching state while its
 * query has nothing to show: skeleton on first load, error + Retry, offline
 * without cache, and no access on 403. Cached content always wins, except
 * after a 403.
 */
export function StScreen({
  query,
  kind,
  screen,
  children,
  errorText: text,
  title,
}: StScreenProps) {
  const enabled = useDesignV3();
  if (!enabled) return <>{children}</>;
  const state = screenState(query);
  if (state === "content") return <>{children}</>;
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      data-st-state={state}
    >
      <div className="st-layer" data-st-layer={screen ?? kind ?? "list"}>
        {state === "loading" ? (
          <StSkeleton
            kind={kind ?? (screen ? SCREEN_KIND[screen] : undefined) ?? "list"}
          />
        ) : state === "no-access" ? (
          <div className="st-center is-mid">
            <StNoAccess
              title={title}
              kind={screen === "moodboards" ? "moodboard" : "document"}
            />
          </div>
        ) : (
          <div className="st-center">
            <StError
              text={
                state === "offline"
                  ? "You’re offline — reconnect to load this."
                  : (text ?? errorText(screen))
              }
              onRetry={query.refetch}
            />
          </div>
        )}
      </div>
    </div>
  );
}
