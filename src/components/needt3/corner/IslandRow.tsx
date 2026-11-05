"use client";

/* One row of the corner's island, and the sink that hands the island to the
 * `notify` facade. Out of AskCorner so a test can mount the real island rows
 * and the real notice pipeline without the whole corner. */
import * as React from "react";

import {
  LuCalendarCheck,
  LuCheck,
  LuLink,
  LuMoveRight,
  LuSparkles,
  LuTriangleAlert,
  LuUser,
  LuX,
} from "react-icons/lu";

import { setNoticeSink } from "@/components/needt/corner/bridge";
import { useNotify } from "@/components/needt/corner/notices";
import type {
  Notice,
  NoticeAct,
  NoticeKind,
} from "@/components/needt/corner/types";

import { primaryAct } from "./island";

const KINDS: Record<
  NoticeKind,
  { Icon: React.ComponentType<{ size?: number }>; tone: string }
> = {
  placed: { Icon: LuCalendarCheck, tone: "var(--accent)" },
  moved: { Icon: LuMoveRight, tone: "var(--accent)" },
  risk: { Icon: LuTriangleAlert, tone: "var(--destructive)" },
  done: { Icon: LuCheck, tone: "var(--success)" },
  agent: { Icon: LuSparkles, tone: "var(--accent)" },
  person: { Icon: LuUser, tone: "var(--info)" },
  blocked: { Icon: LuLink, tone: "var(--destructive)" },
};

/** Hands the mounted island to the plain-function `notify` facade. */
export function IslandSink() {
  const api = useNotify();
  React.useEffect(() => {
    setNoticeSink(api, "island");
    return () => setNoticeSink(null, "island");
  }, [api]);
  return null;
}

export function IslandRow({
  notice,
  onAct,
  onClose,
}: {
  notice: Notice;
  onAct: (n: Notice, a: NoticeAct) => void;
  onClose: (id: string) => void;
}) {
  const kind = KINDS[notice.kind] ?? KINDS.agent;
  const act = primaryAct(notice);
  return (
    <div
      className="v3c-row chat-msg-in"
      data-island-row={notice.id}
      data-leaving={notice.leaving ? "" : undefined}
    >
      <span
        className="shell-nf-card-grid"
        aria-hidden="true"
        style={{
          color: kind.tone,
          background: `color-mix(in oklab, ${kind.tone} 15%, transparent)`,
        }}
      >
        <kind.Icon size={15} />
      </span>
      <span className="v3c-text">
        <span className="chat-span-4 v3c-line">{notice.title}</span>
        {notice.body ? (
          <span className="chat-span-8 v3c-line">{notice.body}</span>
        ) : null}
      </span>
      {act ? (
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm nx-press"
          onClick={() => onAct(notice, act)}
        >
          {act.label}
        </button>
      ) : null}
      <button
        type="button"
        className="chat-tool v3c-x"
        aria-label="Dismiss"
        onClick={() => onClose(notice.id)}
      >
        <LuX size={13} />
      </button>
    </div>
  );
}
