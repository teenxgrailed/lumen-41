"use client";

/* THE PANEL — Ask Needt open (prototype Chat.jsx `Chat`, the corner frame).
 *
 * Ported: glass header with the orb, empty state with suggestions, the thread
 * (yours in a bubble, Needt's beside its orb), the "Thinking…" line, the
 * streaming caret, Stop, and confirming an action the agent asked about.
 * Replies come from /api/ai/chat through `useAskNeedt`.
 */
import * as React from "react";

import {
  LuArrowUp,
  LuCalendarCheck,
  LuClock,
  LuSquare,
  LuSquarePen,
  LuX,
} from "react-icons/lu";

import { newDate } from "@/lib/date-utils";

import { AiOrb } from "../orb/AiOrb";
import type { AskMessage, AskPhase } from "./useAskNeedt";

const SUGGESTIONS = [
  {
    id: "plan",
    icon: LuCalendarCheck,
    title: "Plan my day",
    sub: "Place what is open into today",
    say: "Plan my day",
  },
  {
    id: "overdue",
    icon: LuClock,
    title: "What's overdue?",
    sub: "Tasks past their due date",
    say: "What is overdue?",
  },
] as const;

function clock(at: number): string {
  const d = newDate(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function greeting(): string {
  const h = newDate().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export interface ChatPanelProps {
  messages: readonly AskMessage[];
  phase: AskPhase;
  onSend: (line: string, confirmed?: boolean) => void;
  onStop: () => void;
  onNew: () => void;
  onClose: () => void;
}

export function ChatPanel({
  messages,
  phase,
  onSend,
  onStop,
  onNew,
  onClose,
}: ChatPanelProps) {
  const [draft, setDraft] = React.useState("");
  const [scrolled, setScrolled] = React.useState(false);
  const field = React.useRef<HTMLTextAreaElement>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const busy = phase !== "idle";
  const last = messages[messages.length - 1];

  React.useEffect(() => {
    field.current?.focus();
  }, []);

  /* Keep the newest line in view while it thinks and streams. */
  React.useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  const send = (line = draft) => {
    if (!line.trim() || busy) return;
    onSend(line);
    setDraft("");
  };

  return (
    <>
      <div className={`chat-head${scrolled ? " is-scrolled" : ""}`}>
        <span className="chat-head-orb">
          <AiOrb size={28} active={busy} />
        </span>
        <div className="chat-head-text">
          <span className="chat-head-title">Ask Needt</span>
        </div>
        <button
          type="button"
          className="chat-tool"
          aria-label="New chat"
          title="New chat"
          onClick={() => {
            onNew();
            field.current?.focus();
          }}
        >
          <LuSquarePen size={15} />
        </button>
        <button
          type="button"
          className="chat-tool"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <LuX size={15} />
        </button>
      </div>

      <div
        ref={scroller}
        className="scroll-inner chat-scroll"
        data-chat-scroll
        onScroll={(e) => {
          const s = e.currentTarget.scrollTop > 4;
          if (s !== scrolled) setScrolled(s);
        }}
      >
        {messages.length === 0 ? (
          <div className="chat-empty" data-chat-empty>
            <span className="chat-empty-orb">
              <AiOrb size={40} />
            </span>
            <div className="chat-hello">{greeting()}</div>
            <div className="chat-hello-sub">
              Ask about your day, your tasks or a doc. I&apos;ll show what
              changes before anything moves.
            </div>
            <div className="chat-suggest-grid">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="chat-suggest-card"
                  data-chat-suggest={s.id}
                  onClick={() => send(s.say)}
                >
                  <i className="chat-suggest-icon">
                    <s.icon size={15} />
                  </i>
                  <strong className="chat-suggest-title">{s.title}</strong>
                  <em className="chat-suggest-sub">{s.sub}</em>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            if (m.from === "you") {
              return (
                <div
                  key={m.id}
                  className="chat-msg is-you chat-msg-in"
                  data-chat-msg="you"
                >
                  <span className="chat-bubble-row">
                    <span className="chat-time">{clock(m.at)}</span>
                    <span className="chat-bubble">{m.text}</span>
                  </span>
                </div>
              );
            }
            const live = busy && m === last;
            if (live && phase === "thinking" && !m.text) {
              return (
                <div key={m.id} className="chat-msg is-ai chat-msg-in">
                  <span className="chat-avatar">
                    <AiOrb size={22} active />
                  </span>
                  <span className="chat-think-body" role="status">
                    <span className="chat-think-now">Thinking…</span>
                  </span>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className="chat-msg is-ai chat-msg-in"
                data-chat-msg="needt"
              >
                <span className="chat-avatar">
                  <AiOrb size={22} active={live} />
                </span>
                <span className="chat-ai-body">
                  <span
                    className={`chat-ai-text${m.stopped || m.failed ? " is-stopped" : ""}`}
                  >
                    {m.text}
                    {live ? (
                      <span className="chat-caret" aria-hidden="true" />
                    ) : null}
                  </span>
                  {m.confirm && !busy ? (
                    <span className="chat-follow">
                      <button
                        type="button"
                        className="chat-follow-btn"
                        data-chat-confirm
                        onClick={() => onSend(m.confirm ?? "", true)}
                      >
                        Confirm
                      </button>
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-composer-wrap">
        <div className={`chat-composer${draft.trim() ? " has-text" : ""}`}>
          <textarea
            ref={field}
            className="chat-input"
            rows={1}
            value={draft}
            data-chat-input
            placeholder="Ask, or tell it what to change"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="chat-tools">
            <span className="chat-tools-gap" />
            {busy ? (
              <button
                type="button"
                className="chat-send is-stop"
                aria-label="Stop"
                title="Stop"
                data-chat-stop
                onClick={onStop}
              >
                <LuSquare size={12} />
              </button>
            ) : (
              <button
                type="button"
                className="chat-send"
                aria-label="Send"
                data-chat-send
                disabled={!draft.trim()}
                onClick={() => send()}
              >
                <LuArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
