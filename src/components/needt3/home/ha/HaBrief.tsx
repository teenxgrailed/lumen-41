"use client";

import { useState } from "react";

import { AiOrb } from "@/components/needt3/orb/AiOrb";
import { ProBadge } from "@/components/needt3/paywall/Pro";

import { HaI } from "./ui";

/**
 * 2 - the morning brief: one or two lines from the agent under the Highlight,
 * the note End day left the evening before, and an x that hides it until
 * tomorrow. Free: the same place carries PRO and "Try Pro". Draws nothing when
 * it has nothing to say.
 */
export function HaBrief({
  lines,
  note,
  locked,
  onClose,
  onUpgrade,
}: {
  /** The agent's lines (plain text). */
  lines?: readonly string[];
  /** What End day left for this morning ("From yesterday"). */
  note?: string;
  /** Free: the upsell in place of the brief. */
  locked?: boolean;
  onClose?: () => void;
  onUpgrade?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const said = (lines ?? []).filter(Boolean);
  if (!open) return null;
  if (locked)
    return (
      <div className="ha-brief is-locked" data-ha-brief="locked">
        <div className="ha-brief-body">
          <div className="ha-brief-by">
            <AiOrb size={12} tile={false} />
            Morning brief <ProBadge size="sm" />
          </div>
          <p>Two lines each morning: what&apos;s on, what to start with.</p>
        </div>
        <button type="button" className="ha-btn" onClick={onUpgrade}>
          Try Pro
        </button>
      </div>
    );
  if (!said.length && !note) return null;
  return (
    <div
      className="ha-brief"
      role="note"
      aria-label="Morning brief"
      data-ha-brief=""
    >
      <div className="ha-brief-body">
        <div className="ha-brief-by">
          <AiOrb size={12} tile={false} />
          Morning brief
        </div>
        {said.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        {note ? (
          <p data-ha-brief-note="">
            <b>From yesterday</b> {note}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="ha-x"
        aria-label="Hide until tomorrow"
        title="Hide until tomorrow"
        onClick={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <HaI n="x" />
      </button>
    </div>
  );
}
