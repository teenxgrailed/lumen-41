"use client";

/* WHAT ASK DID — shared by the docked panel and the phone sheet.
 *
 * While a tool runs: one shimmering line. Afterwards: a compact list of what
 * changed, each with Undo, "Undo all" when there is more than one, and the
 * objects the answer read as links. Everything here comes from the `tool` and
 * `done` lines of /api/ai/chat; the actions are AgentActions, so Undo is the
 * same path as the MCP's.
 */
import * as React from "react";

import Link from "next/link";

import { LuCheck, LuCircleAlert, LuUndo2 } from "react-icons/lu";

import type { AskMessage } from "./useAskNeedt";

export interface AskActivityProps {
  message: AskMessage;
  busy: boolean;
  onUndo: (messageId: string, actionId: string) => void;
  onUndoAll: (messageId: string, runId: string) => void;
}

/** Only same-origin app paths become links; anything else stays text. */
export function safeAppHref(href: string): string | null {
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(href) ? href : null;
}

/**
 * Answer text with `[title](/path)` turned into links. The model is asked to
 * cite what it read this way; a link it invents to somewhere else is shown
 * as its plain title.
 */
export function AskText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const pattern = /\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const href = safeAppHref(match[2]);
    parts.push(
      href ? (
        <Link key={match.index} href={href} className="ask-act-link">
          {match[1]}
        </Link>
      ) : (
        match[1]
      )
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function AskActivity({
  message,
  busy,
  onUndo,
  onUndoAll,
}: AskActivityProps) {
  const running = (message.tools ?? []).filter((t) => t.status === "running");
  const actions = message.actions ?? [];
  const applied = actions.filter(
    (a) => a.state === "applied" && a.undoable
  ).length;
  const sources = (message.sources ?? []).filter(
    (s) => safeAppHref(s.href) !== null
  );

  return (
    <>
      {busy && running.length ? (
        <span className="ask-act-running" role="status" data-ask-running="">
          {running[running.length - 1].label}…
        </span>
      ) : null}
      {actions.length ? (
        <ul className="ask-act-list" data-ask-actions="" aria-label="Changes">
          {actions.map((action) => {
            const href = action.href ? safeAppHref(action.href) : null;
            return (
              <li key={action.actionId} className="ask-act-row">
                <span className="ask-act-mark" aria-hidden="true">
                  {action.state === "conflict" || action.state === "failed" ? (
                    <LuCircleAlert size={13} />
                  ) : action.state === "undone" ? (
                    <LuUndo2 size={13} />
                  ) : (
                    <LuCheck size={13} />
                  )}
                </span>
                <span
                  className={`ask-act-label${action.state === "undone" ? " is-undone" : ""}`}
                >
                  {href ? (
                    <Link href={href} className="ask-act-link">
                      {action.label}
                    </Link>
                  ) : (
                    action.label
                  )}
                </span>
                {action.state === "applied" && action.undoable ? (
                  <button
                    type="button"
                    className="ask-act-undo"
                    data-ask-undo={action.actionId}
                    disabled={busy}
                    onClick={() => onUndo(message.id, action.actionId)}
                  >
                    Undo
                  </button>
                ) : action.state === "undone" ? (
                  <span className="ask-act-state">Undone</span>
                ) : action.state === "conflict" ? (
                  <span className="ask-act-state">Changed since</span>
                ) : action.state === "failed" ? (
                  <span className="ask-act-state">Could not undo</span>
                ) : null}
              </li>
            );
          })}
          {applied > 1 && message.runId ? (
            <li className="ask-act-all">
              <button
                type="button"
                className="ask-act-undo"
                data-ask-undo-all=""
                disabled={busy}
                onClick={() => onUndoAll(message.id, message.runId as string)}
              >
                Undo all
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {sources.length && !busy ? (
        <span className="ask-act-sources" data-ask-sources="">
          {sources.slice(0, 6).map((source) => (
            <Link
              key={`${source.type}:${source.id}`}
              href={source.href}
              className="ask-act-source"
            >
              {source.title}
            </Link>
          ))}
        </span>
      ) : null}
    </>
  );
}
