"use client";

import type { CSSProperties, ReactNode } from "react";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { BrandIcon, brandIdFor } from "../../brand";
import { type ScreenQuery, errorText, screenState } from "../../states/status";
import { PkButton, PkEmpty, pkCx } from "../kit";

const retryLabel = strings["states.jsx"].StError.retry;

/**
 * A calm row (phone-places.jsx `PplRow`): a lead, a title, one status line and
 * one action at the end. The text is a real button when `onOpen` is given, so
 * the action never nests inside it.
 */
export function PplRow({
  lead,
  title,
  meta,
  tone,
  action,
  onOpen,
  openLabel,
  data,
}: {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  tone?: "late" | "on" | null;
  action?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  data?: Record<string, string>;
}) {
  const main = (
    <>
      <span className="ppl-row-title">{title}</span>
      {meta ? (
        <span className={pkCx("ppl-row-meta", tone && `is-${tone}`)}>
          {tone === "late" ? <span className="pk-alert-dot" /> : null}
          <span className="ppl-row-meta-text">{meta}</span>
        </span>
      ) : null}
    </>
  );
  return (
    <div className="ppl-row" {...(data ?? {})}>
      {lead ? <span className="ppl-row-lead">{lead}</span> : null}
      {onOpen ? (
        <button
          type="button"
          className="ppl-row-main is-open"
          onClick={onOpen}
          aria-label={openLabel}
        >
          {main}
        </button>
      ) : (
        <span className="ppl-row-main">{main}</span>
      )}
      {action ? <span className="ppl-row-act">{action}</span> : null}
    </div>
  );
}

/** A provider's brand mark on its app-icon tile (36 in rows, 44 in the account sheet). */
export function PplTile({ slug, size = 36 }: { slug: string; size?: number }) {
  return <BrandIcon id={brandIdFor(slug)} size={size} />;
}

const WIDTHS = [62, 48, 70, 54, 66, 44];

/** Rows of grey bars while the first load is out (the bars shimmer; reduced motion stills them in CSS). */
export function PplSkeleton({ rows = 6 }: { rows?: number }) {
  const bar = (w: number | string, h: number, r = 5): CSSProperties => ({
    width: w,
    height: h,
    borderRadius: r,
  });
  return (
    <div
      className="ppl-list"
      aria-busy="true"
      aria-label={strings["states.jsx"].StSkeleton.loading}
      data-ppl-skeleton=""
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ppl-row">
          <span className="ppl-row-lead">
            <span className="st-sk" style={bar(40, 40, 10)} />
          </span>
          <span className="ppl-row-main">
            <span className="st-sk" style={bar(`${WIDTHS[i % 6]}%`, 14)} />
            <span
              className="st-sk"
              style={bar(`${WIDTHS[(i + 3) % 6] - 10}%`, 10)}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The phone's loading, error and offline states for a place that reads
 * through a query: the skeleton on the first load, then a quiet message with
 * Retry. Cached content always wins (the desktop's `StScreen` rule).
 */
export function PhoneState({
  query,
  screen,
  children,
}: {
  query: ScreenQuery;
  screen: string;
  children: ReactNode;
}) {
  const state = screenState(query);
  if (state === "content") return <>{children}</>;
  if (state === "loading") return <PplSkeleton />;
  return (
    <div role="alert" data-ppl-state={state}>
      <PkEmpty
        sky={false}
        title={state === "offline" ? "You’re offline" : "Couldn’t load"}
        line={
          state === "offline" ? "Reconnect to load this." : errorText(screen)
        }
        action={
          <PkButton
            kind="chip"
            onClick={() => void query.refetch()}
            data-ppl-retry=""
          >
            {retryLabel}
          </PkButton>
        }
      />
    </div>
  );
}
