"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  FiArrowUp,
  FiChevronDown,
  FiList,
  FiMic,
  FiSquare,
} from "react-icons/fi";

import { newDate } from "@/lib/date-utils";
import { sendJson } from "@/lib/needt3/hooks/core";

import { useAskNeedt } from "../corner/useAskNeedt";
import { listKeys, shortWhen } from "./AgParts";
import { AgentIcon } from "./AgentIcon";
import { AlertCard, ApprovalCard } from "./ApprovalCard";
import { ChatWave, type WaveHandle, type WaveMode } from "./ChatWave";
import { type HubThreadRow, ThreadDetail } from "./MessagesTab";
import type { HubItemRow } from "./TasksTab";

export interface ChatAlert {
  key: string;
  agent: string;
  what: string;
  reason: string;
  at: string | null;
  action: string;
  run: () => void;
}

type Run = (task: () => Promise<unknown>, done?: string) => Promise<void>;

/** Where the person came from, by `?from=`; a label only. */
const FROM_LABEL: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
};

const HINTS = [
  "Ask about your week…",
  "What did the agents finish today?",
  "Plan tomorrow around your calendar…",
];

/** Words that arrive one by one with a blur-in (the reference's `.w`). */
function Words({ text, step = 38 }: { text: string; step?: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span
          key={i}
          className="ag-w"
          style={{ animationDelay: `${i * step}ms` }}
        >
          {w}
        </span>
      ))}
    </>
  );
}

interface SpeechRec {
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  interimResults: boolean;
}
function speechRecognition(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRec)
      | undefined) ?? null
  );
}

/**
 * Chat (owner, 05.11.26: replaces Messages; final reference). One centred
 * column with one input pill. Empty, a breathing wave of capsules and a hint
 * that types itself in; sending lifts the text out of the input, the wave
 * contracts to a dot while Needt AI thinks, and the answer arrives word by
 * word. What agents ask you arrives in the same stream as cards with a
 * status rail (orange: waiting on you) and Approve / Answer. Threads are in
 * a slim drawer on the left; opening one swaps the column to it.
 *
 * //todo: "the AI you came from" (for example ChatGPT) cannot be answered
 * from Needt; `?from=` only names it in the chip. Replies come from Needt AI.
 */
export function ChatTab({
  threads,
  waiting,
  alerts = [],
  focusThread,
  onOpenThread,
  onOpenItem,
  itemTitle,
  from,
  run,
}: {
  threads: HubThreadRow[];
  /** Items an agent is waiting on you for. */
  waiting: HubItemRow[];
  /** Broken or urgent (red): a revoked token, a failed task. */
  alerts?: ChatAlert[];
  focusThread: string | null;
  onOpenThread: (id: string | null) => void;
  onOpenItem: (id: string) => void;
  itemTitle: (id: string) => string | null;
  from: string | null;
  run: Run;
}) {
  const ai = useAskNeedt();
  const wave = useRef<WaveHandle>(null);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [thread, setThread] = useState<string | null>(focusThread);
  const [line, setLine] = useState("");
  const [replyTo, setReplyTo] = useState<HubItemRow | null>(null);
  const [answered, setAnswered] = useState<
    Record<string, "answered" | "approved">
  >({});
  const [hint, setHint] = useState(0);
  const [hintTop, setHintTop] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const stream = useRef<HTMLDivElement>(null);
  const open = threads.find((t) => t.id === thread) ?? null;
  const unread = threads.filter((t) => t.ownerUnread);
  const busy = ai.phase !== "idle";
  const started =
    ai.messages.length > 0 ||
    waiting.length > 0 ||
    unread.length > 0 ||
    alerts.length > 0;
  const mode: WaveMode = open
    ? "dock"
    : busy
      ? started
        ? "thinkdock"
        : "think"
      : started
        ? "dock"
        : "chat";
  const model = from && FROM_LABEL[from] ? FROM_LABEL[from] : "Needt AI";
  const Speech = speechRecognition();

  // The hint rotates every 7 s while the chat is empty.
  useEffect(() => {
    if (started) return undefined;
    const id = window.setInterval(
      () => setHint((h) => (h + 1) % HINTS.length),
      7000
    );
    return () => window.clearInterval(id);
  }, [started]);

  // A new bubble of yours lifts out of the input (blur to sharp).
  const mine = ai.messages.filter((m) => m.from === "you").length;
  useLayoutEffect(() => {
    if (!mine) return;
    const box = form.current?.getBoundingClientRect();
    const list = stream.current?.querySelectorAll<HTMLElement>(
      "[data-ag-ai-msg='you']"
    );
    const last = list?.[list.length - 1];
    if (!last || !box || typeof last.animate !== "function") return;
    const b = last.getBoundingClientRect();
    last.animate(
      [
        {
          transform: `translateY(${box.top - b.top}px) scale(.94)`,
          opacity: 0.15,
          filter: "blur(7px)",
        },
        { transform: "none", opacity: 1, filter: "blur(0)" },
      ],
      { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }, [mine]);

  useEffect(() => {
    const el = stream.current;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: "smooth" });
  }, [ai.messages.length, ai.phase, waiting.length]);

  // An answer arriving wakes the wave.
  useEffect(() => {
    if (ai.phase === "streaming") wave.current?.spike(0.7);
  }, [ai.phase]);

  useEffect(() => {
    if (!menu) return undefined;
    const away = () => setMenu(false);
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, [menu]);

  const pick = (id: string | null) => {
    setThread(id);
    setDrawer(false);
    setReplyTo(null);
    onOpenThread(id);
    window.requestAnimationFrame(() => input.current?.focus());
  };

  const answer = (item: HubItemRow, text: string) =>
    run(
      () =>
        sendJson(`/api/agent-hub/items/${item.id}/answer`, "POST", {
          answer: text,
        }),
      "Answered"
    ).then(() => setAnswered((a) => ({ ...a, [item.id]: "answered" })));
  const approve = (item: HubItemRow) =>
    run(
      () =>
        sendJson(`/api/agent-hub/items/${item.id}/approve`, "POST", {
          risks: item.risks.filter((r) => !item.approvals[r]),
        }),
      "Approved"
    ).then(() => {
      setAnswered((a) => ({ ...a, [item.id]: "approved" }));
      wave.current?.spike(1);
      wave.current?.ripple(0.8);
    });

  const submit = async () => {
    const text = line.trim();
    if (!text) return;
    setLine("");
    if (open) {
      await run(() =>
        sendJson("/api/agent-hub/messages", "POST", {
          threadId: open.id,
          body: text,
        })
      );
      return;
    }
    if (replyTo) {
      const item = replyTo;
      setReplyTo(null);
      await answer(item, text);
      return;
    }
    if (busy) return;
    wave.current?.spike(0.5);
    await ai.send(text);
  };

  const mic = () => {
    if (!Speech) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new Speech();
    r.interimResults = true;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join("");
      setLine(text);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    wave.current?.spike(0.9);
    wave.current?.ripple(0.7);
    r.start();
  };

  const who = (item: HubItemRow) =>
    item.assignee && item.assignee !== "any"
      ? (item.assignee.name ?? "An agent")
      : "An agent";

  return (
    <div
      className={"ag-chat2" + (started ? " is-started" : "")}
      data-ag-chat=""
    >
      <ChatWave ref={wave} mode={mode} onLayout={setHintTop} />

      <div className="ag-chatbar">
        <button
          type="button"
          className="ag-round ag-glass2"
          aria-label="Threads"
          aria-expanded={drawer}
          data-ag-threads-toggle=""
          onClick={() => setDrawer(!drawer)}
        >
          <FiList size={15} aria-hidden />
          {unread.length ? (
            <span className="ag-round-dot" aria-hidden="true" />
          ) : null}
        </button>
        <div className="ag-chip-box">
          <button
            type="button"
            className="ag-chip2 ag-glass2"
            aria-haspopup="menu"
            aria-expanded={menu}
            data-ag-model=""
            onClick={(e) => {
              e.stopPropagation();
              setMenu(!menu);
            }}
          >
            <i aria-hidden="true" />
            {open ? open.subject : model}
            <FiChevronDown size={11} aria-hidden />
          </button>
          {menu ? (
            <div className="ag-menu2 ag-glass2" role="menu">
              <button type="button" role="menuitem" onClick={() => pick(null)}>
                Needt AI
              </button>
              {from && FROM_LABEL[from] ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  title="Answers come from Needt AI"
                >
                  {`From ${FROM_LABEL[from]}`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {open ? (
          <button type="button" className="ag-link2" onClick={() => pick(null)}>
            Back to Needt AI
          </button>
        ) : ai.messages.length ? (
          <button type="button" className="ag-link2" onClick={ai.reset}>
            New chat
          </button>
        ) : null}
      </div>

      <aside
        className="ag-drawer2 ag-glass2"
        aria-label="Threads"
        data-open={drawer ? "" : undefined}
      >
        <h4>Threads</h4>
        <div role="list" onKeyDown={listKeys}>
          <div role="listitem">
            <button
              type="button"
              className="ag-thread"
              aria-current={open ? undefined : "true"}
              data-ag-thread="ai"
              onClick={() => pick(null)}
            >
              <span className="ag-mono ag-mono-ai" aria-hidden="true" />
              <span className="ag-thread-t">Needt AI</span>
            </button>
          </div>
          {threads.map((t) => (
            <div role="listitem" key={t.id}>
              <button
                type="button"
                className="ag-thread"
                aria-current={open?.id === t.id ? "true" : undefined}
                data-ag-thread={t.id}
                onClick={() => pick(t.id)}
              >
                <AgentIcon name={t.last?.from ?? t.subject} size={20} />
                <span className="ag-thread-t">{t.subject}</span>
                {t.ownerUnread ? (
                  <span className="ag-un" role="img" aria-label="Unread" />
                ) : null}
                <em>{shortWhen(t.lastMessageAt).split(", ")[1] ?? ""}</em>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {!started && !open ? (
        <div
          className="ag-hint"
          aria-hidden="true"
          key={hint}
          style={hintTop !== null ? { top: hintTop } : undefined}
        >
          <Words text={HINTS[hint]} step={140} />
        </div>
      ) : null}

      <div className="ag-cmsgs" ref={stream} data-ag-chat-stream="">
        {open ? (
          <ThreadDetail
            key={open.id}
            id={open.id}
            task={
              open.itemId
                ? {
                    id: open.itemId,
                    title: itemTitle(open.itemId) ?? "The task",
                  }
                : null
            }
            onOpenItem={onOpenItem}
            withReply={false}
          />
        ) : (
          <>
            {alerts.map((a) => (
              <AlertCard
                key={a.key}
                agent={a.agent}
                what={a.what}
                reason={a.reason}
                at={a.at}
                action={a.action}
                onAction={a.run}
              />
            ))}
            {waiting.map((item) => (
              <ApprovalCard
                key={item.id}
                item={item}
                agent={who(item)}
                now={newDate().getTime()}
                done={answered[item.id] ?? null}
                onApprove={() => approve(item)}
                onAnswer={() => {
                  setReplyTo(item);
                  input.current?.focus();
                }}
                onOpen={() => onOpenItem(item.id)}
              />
            ))}
            {unread.map((t) => (
              <div
                key={t.id}
                className="ag-acard ag-glass2 is-note"
                data-ag-unread={t.id}
              >
                <div className="ag-acard-h">
                  <AgentIcon name={t.last?.from ?? t.subject} size={32} />
                  <div>
                    <b>
                      {t.last?.from ?? "An agent"}
                      <i aria-hidden="true" />
                    </b>
                    <small>{`wrote · ${shortWhen(t.lastMessageAt)}`}</small>
                  </div>
                </div>
                <p>{t.subject}</p>
                {t.last ? (
                  <span className="ag-acard-q">{t.last.text}</span>
                ) : null}
                <div className="ag-acard-bt">
                  <button
                    type="button"
                    className="ag-btn2"
                    onClick={() => pick(t.id)}
                  >
                    Open the thread
                  </button>
                </div>
              </div>
            ))}
            {ai.messages.map((m) =>
              m.from === "you" ? (
                <div key={m.id} className="ag-cmsg is-me" data-ag-ai-msg="you">
                  {m.text}
                </div>
              ) : m.text ? (
                <div
                  key={m.id}
                  className="ag-cmsg is-ai"
                  data-ag-ai-msg="needt"
                >
                  <Words text={m.text} />
                </div>
              ) : m.failed ? (
                <div
                  key={m.id}
                  className="ag-cmsg is-ai"
                  data-ag-ai-msg="needt"
                >
                  Could not reach Needt AI.
                </div>
              ) : null
            )}
            {!started ? (
              <span className="ag-sr" data-ag-chat-empty="">
                Ask Needt AI about your agents and their work. When an agent
                asks you something, it shows up here.
              </span>
            ) : null}
          </>
        )}
      </div>

      <form
        ref={form}
        className={"ag-composer ag-glass2" + (line.trim() ? " has" : "")}
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={input}
          value={line}
          aria-label={
            open
              ? `Reply in ${open.subject}`
              : replyTo
                ? `Reply to ${who(replyTo)}`
                : "Ask Needt"
          }
          placeholder={
            open
              ? "Reply to everyone in the thread…"
              : replyTo
                ? `Reply to ${who(replyTo)}…`
                : "Ask Needt…"
          }
          data-ag-chat-input=""
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && replyTo) {
              e.stopPropagation();
              setReplyTo(null);
            }
          }}
        />
        {Speech ? (
          <button
            type="button"
            className={"ag-round" + (listening ? " is-on" : "")}
            aria-label={listening ? "Stop listening" : "Speak"}
            aria-pressed={listening}
            onClick={mic}
          >
            <FiMic size={15} aria-hidden />
          </button>
        ) : null}
        {busy && !open && !replyTo ? (
          <button
            type="button"
            className="ag-round ag-send"
            aria-label="Stop"
            onClick={ai.stop}
          >
            <FiSquare size={13} aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            className="ag-round ag-send"
            aria-label="Send"
            disabled={!line.trim()}
            data-ag-chat-send=""
          >
            <FiArrowUp size={15} aria-hidden />
          </button>
        )}
      </form>
    </div>
  );
}
