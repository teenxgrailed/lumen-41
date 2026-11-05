"use client";

import { useEffect, useRef, useState } from "react";

import { FiArrowUp, FiList, FiSquare, FiX } from "react-icons/fi";

import { sendJson } from "@/lib/needt3/hooks/core";

import { useAskNeedt } from "../corner/useAskNeedt";
import { AgAvatar, AgBtn, listKeys, shortWhen, useAgentHue } from "./AgParts";
import { type HubThreadRow, ThreadDetail } from "./MessagesTab";
import type { HubItemRow } from "./TasksTab";

type Run = (task: () => Promise<unknown>, done?: string) => Promise<void>;

/** Where the person came from, by `?from=`; a label only. */
const FROM_LABEL: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
};

/**
 * Chat (owner, 05.11.26: replaces Messages). In the middle, one conversation
 * with Needt AI and one line to type in. What agents ask you and write to you
 * arrives in the same stream as cards: an item waiting on your answer can be
 * answered right there, an unread thread opens in place. Every thread is in
 * a thin drawer on the left; opening one swaps the middle to it, and the
 * line then replies to that thread.
 *
 * //todo: "the AI you came from" (for example ChatGPT) cannot be answered
 * from Needt; `?from=` only names it. Replies always come from Needt AI.
 * //todo: the visual waits for the owner's chosen style (05.11.26).
 */
export function ChatTab({
  threads,
  waiting,
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
  focusThread: string | null;
  onOpenThread: (id: string | null) => void;
  onOpenItem: (id: string) => void;
  itemTitle: (id: string) => string | null;
  from: string | null;
  run: Run;
}) {
  const hue = useAgentHue();
  const ai = useAskNeedt();
  const [drawer, setDrawer] = useState(false);
  const [thread, setThread] = useState<string | null>(focusThread);
  const [line, setLine] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const open = threads.find((t) => t.id === thread) ?? null;
  const unread = threads.filter((t) => t.ownerUnread);
  const busy = ai.phase !== "idle";

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [ai.messages.length, ai.phase]);

  const pick = (id: string | null) => {
    setThread(id);
    setDrawer(false);
    onOpenThread(id);
    window.requestAnimationFrame(() => input.current?.focus());
  };

  const submit = async () => {
    const text = line.trim();
    if (!text) return;
    if (open) {
      setLine("");
      await run(() =>
        sendJson("/api/agent-hub/messages", "POST", {
          threadId: open.id,
          body: text,
        })
      );
      return;
    }
    if (busy) return;
    setLine("");
    await ai.send(text);
  };

  return (
    <div className={"ag-chat" + (drawer ? " has-drawer" : "")} data-ag-chat="">
      <aside
        className="ag-chat-drawer"
        aria-label="Threads"
        data-open={drawer ? "" : undefined}
      >
        <div className="ag-chat-drawer-head">
          <span>Threads</span>
          <button
            type="button"
            className="cn-iconbtn"
            aria-label="Close threads"
            onClick={() => setDrawer(false)}
          >
            <FiX size={14} aria-hidden />
          </button>
        </div>
        <div className="ag-list" role="list" onKeyDown={listKeys}>
          <div role="listitem">
            <button
              type="button"
              className="ag-thread"
              aria-current={open ? undefined : "true"}
              data-ag-thread="ai"
              onClick={() => pick(null)}
            >
              <AgAvatar
                name="Needt AI"
                hue="rgba(246,245,250,0.85)"
                size={28}
              />
              <span className="ag-thread-text">
                <b>Needt AI</b>
                <span className="ag-thread-prev">
                  {from && FROM_LABEL[from]
                    ? `You came from ${FROM_LABEL[from]}`
                    : "Ask about anything in Needt"}
                </span>
              </span>
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
                <AgAvatar
                  name={t.last?.from ?? t.subject}
                  hue={hue(t.last?.from)}
                  size={28}
                />
                <span className="ag-thread-text">
                  <b>{t.subject}</b>
                  <span className="ag-thread-prev">
                    {t.last ? `${t.last.from}: ${t.last.text}` : "Empty"}
                  </span>
                </span>
                <span className="ag-thread-meta">
                  <span>{shortWhen(t.lastMessageAt)}</span>
                  {t.ownerUnread ? (
                    <span className="ag-un" role="img" aria-label="Unread" />
                  ) : null}
                </span>
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section
        className="ag-chat-main"
        aria-label={open ? open.subject : "Needt AI"}
      >
        <header className="ag-chat-head">
          <button
            type="button"
            className="ag-btn"
            aria-expanded={drawer}
            data-ag-threads-toggle=""
            onClick={() => setDrawer(!drawer)}
          >
            <FiList size={13} aria-hidden />
            Threads
            {unread.length ? <small>{unread.length}</small> : null}
          </button>
          <h2 className="ag-chat-title">{open ? open.subject : "Needt AI"}</h2>
          {open ? (
            <AgBtn tone="text" onClick={() => pick(null)}>
              Back to Needt AI
            </AgBtn>
          ) : ai.messages.length ? (
            <AgBtn tone="text" onClick={ai.reset}>
              New chat
            </AgBtn>
          ) : null}
        </header>

        <div className="ag-chat-stream" data-ag-chat-stream="">
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
            <ol className="ag-convo-list" aria-label="Conversation">
              {waiting.map((item) => (
                <li
                  key={item.id}
                  className="ag-chat-card"
                  data-ag-ask={item.id}
                >
                  <span className="ag-msg-head">
                    {`${
                      item.assignee && item.assignee !== "any"
                        ? (item.assignee.name ?? "An agent")
                        : "An agent"
                    } asks · ${shortWhen(item.updatedAt)}`}
                  </span>
                  <b>{item.title}</b>
                  <span className="ag-chat-q">
                    {item.question ?? "Waiting for your decision"}
                  </span>
                  {item.status === "needs_owner" ? (
                    <span className="ag-answer">
                      <input
                        className="nt-input"
                        aria-label={`Answer ${item.title}`}
                        value={answers[item.id] ?? ""}
                        placeholder="Answer"
                        onChange={(e) =>
                          setAnswers({ ...answers, [item.id]: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            (answers[item.id] ?? "").trim()
                          ) {
                            e.preventDefault();
                            void run(
                              () =>
                                sendJson(
                                  `/api/agent-hub/items/${item.id}/answer`,
                                  "POST",
                                  {
                                    answer: answers[item.id],
                                  }
                                ),
                              "Answered"
                            );
                          }
                        }}
                      />
                      <AgBtn
                        disabled={!(answers[item.id] ?? "").trim()}
                        onClick={() =>
                          run(
                            () =>
                              sendJson(
                                `/api/agent-hub/items/${item.id}/answer`,
                                "POST",
                                {
                                  answer: answers[item.id],
                                }
                              ),
                            "Answered"
                          )
                        }
                      >
                        Answer
                      </AgBtn>
                    </span>
                  ) : null}
                  <AgBtn tone="text" onClick={() => onOpenItem(item.id)}>
                    Open the task
                  </AgBtn>
                </li>
              ))}
              {unread.map((t) => (
                <li key={t.id} className="ag-chat-card" data-ag-unread={t.id}>
                  <span className="ag-msg-head">
                    {`${t.last?.from ?? "An agent"} wrote · ${shortWhen(t.lastMessageAt)}`}
                  </span>
                  <b>{t.subject}</b>
                  {t.last ? (
                    <span className="ag-chat-q">{t.last.text}</span>
                  ) : null}
                  <AgBtn tone="text" onClick={() => pick(t.id)}>
                    Open the thread
                  </AgBtn>
                </li>
              ))}
              {ai.messages.map((m) => (
                <li
                  key={m.id}
                  className={"ag-msg" + (m.from === "you" ? " is-mine" : "")}
                  data-ag-ai-msg={m.from}
                >
                  <span className="ag-msg-head">
                    {m.from === "you" ? "You" : "Needt AI"}
                  </span>
                  <span className="ag-msg-body">
                    {m.text ||
                      (m.from === "needt" && busy
                        ? "Thinking…"
                        : m.failed
                          ? "Could not reach Needt AI."
                          : "")}
                  </span>
                </li>
              ))}
              {!waiting.length && !unread.length && !ai.messages.length ? (
                <li className="ag-chat-empty" data-ag-chat-empty="">
                  Ask Needt AI about your agents and their work. When an agent
                  asks you something, it shows up here.
                </li>
              ) : null}
            </ol>
          )}
          <div ref={end} />
        </div>

        <form
          className="ag-chat-line"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            ref={input}
            className="ag-chat-input"
            rows={1}
            value={line}
            aria-label={open ? `Reply in ${open.subject}` : "Message Needt AI"}
            placeholder={
              open ? "Reply to everyone in the thread" : "Message Needt AI"
            }
            data-ag-chat-input=""
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          {busy && !open ? (
            <button
              type="button"
              className="ag-btn"
              aria-label="Stop"
              onClick={ai.stop}
            >
              <FiSquare size={13} aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              className="ag-btn"
              aria-label="Send"
              disabled={!line.trim()}
              data-ag-chat-send=""
            >
              <FiArrowUp size={14} aria-hidden />
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
