"use client";

import { type CSSProperties, useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FiChevronLeft } from "react-icons/fi";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import {
  AgAvatar,
  AgBtn,
  AgEmpty,
  listKeys,
  shortWhen,
  useAgentHue,
} from "./AgParts";

export interface HubThreadRow {
  id: string;
  subject: string;
  itemId: string | null;
  lastMessageAt: string;
  /** A message to you in this thread that you have not opened yet. */
  ownerUnread: boolean;
  last: { from: string; text: string; importance: string } | null;
}

interface ThreadMessage {
  id: string;
  from: { kind: string; name?: string };
  body: string;
  importance: string;
  ackRequired: boolean;
  createdAt: string;
  receipts?: { agent: string; readAt: string | null; ackAt: string | null }[];
}

export const THREADS_KEY = ["agent-hub", "threads"] as const;

export function useHubThreads() {
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: () =>
      fetchJson<{ threads: HubThreadRow[] }>("/api/agent-hub/messages"),
    refetchInterval: 15_000,
  });
}

function acks(message: ThreadMessage) {
  if (!message.ackRequired) return "";
  const done = (message.receipts ?? [])
    .filter((receipt) => receipt.ackAt)
    .map((receipt) => receipt.agent);
  return done.length
    ? ` Acknowledged by ${done.join(", ")}.`
    : " Acknowledgement requested.";
}

/**
 * The Messages tab: threads on the left, the open conversation on the right
 * (on a phone, one at a time, with a way back). Opening a thread marks its
 * alert read. You can reply as yourself; the reply goes to every agent in the
 * thread. Message text comes from agents, so it is shown as plain text. An
 * unread thread carries the accent as a mark and the word "New", never a fill.
 */
export function MessagesTab({
  threads,
  focusId,
  onOpen,
  onOpenItem,
  itemTitle,
}: {
  threads: HubThreadRow[];
  focusId: string | null;
  /** Mirrors the open thread into `?thread=`, so a reload keeps it. */
  onOpen?: (id: string | null) => void;
  /** Opens a thread's hub item inside Agents. */
  onOpenItem?: (id: string) => void;
  itemTitle?: (id: string) => string | null;
}) {
  const hue = useAgentHue();
  const [open, setOpenState] = useState<string | null>(focusId);
  const setOpen = (id: string | null) => {
    setOpenState(id);
    onOpen?.(id);
  };
  if (threads.length === 0) {
    return (
      <AgEmpty
        art="mail"
        title="No messages yet"
        line="Threads between agents, and the ones addressed to you, show up here."
      />
    );
  }
  const current = threads.find((t) => t.id === open) ?? null;
  return (
    <div
      className={"ag-msgs nx-swap" + (current ? " is-open" : "")}
      data-ag-messages=""
    >
      <div className="ag-glass ag-panel ag-threads">
        <div
          className="ag-list"
          role="list"
          aria-label="Threads"
          onKeyDown={listKeys}
        >
          {threads.map((thread) => (
            <div role="listitem" key={thread.id} className="ag-item">
              <button
                type="button"
                className="ag-thread"
                aria-current={open === thread.id ? "true" : undefined}
                data-ag-thread={thread.id}
                style={{ "--c": hue(thread.last?.from) } as CSSProperties}
                onClick={() => setOpen(thread.id)}
              >
                <AgAvatar
                  name={thread.last?.from ?? thread.subject}
                  hue={hue(thread.last?.from)}
                  size={34}
                />
                <span className="ag-thread-text">
                  <b>{thread.subject}</b>
                  <span className="ag-thread-prev">
                    {thread.last
                      ? `${thread.last.from}: ${thread.last.text}`
                      : "Empty"}
                  </span>
                </span>
                <span className="ag-thread-meta">
                  <span>{shortWhen(thread.lastMessageAt)}</span>
                  {thread.ownerUnread ? (
                    <span className="ag-un" role="img" aria-label="Unread" />
                  ) : null}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="ag-glass ag-panel ag-convo">
        {current ? (
          <div className="ag-convo-in" data-ag-convo={current.id}>
            <div className="ag-convo-head">
              <button
                type="button"
                className="nx-btn nx-btn-sm nx-btn-text ag-convo-back"
                onClick={() => setOpen(null)}
              >
                <FiChevronLeft size={14} aria-hidden />
                Threads
              </button>
              <AgAvatar
                name={current.last?.from ?? current.subject}
                hue={hue(current.last?.from)}
                size={30}
              />
              <span className="ag-convo-titles">
                <h2 className="ag-convo-title">{current.subject}</h2>
                <span>
                  {current.itemId ? "Task thread" : "Thread between agents"}
                </span>
              </span>
            </div>
            <ThreadDetail
              key={current.id}
              id={current.id}
              task={
                current.itemId
                  ? {
                      id: current.itemId,
                      title: itemTitle?.(current.itemId) ?? "The task",
                    }
                  : null
              }
              onOpenItem={onOpenItem}
            />
          </div>
        ) : (
          <div className="ag-convo-none">
            <span className="cn-screen-text-2">
              Choose a thread to read it.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadDetail({
  id,
  task,
  onOpenItem,
}: {
  id: string;
  task: { id: string; title: string } | null;
  onOpenItem?: (id: string) => void;
}) {
  const hue = useAgentHue();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const detail = useQuery({
    queryKey: ["agent-hub", "thread", id],
    queryFn: () =>
      fetchJson<{
        thread: { subject: string };
        messages: ThreadMessage[];
      }>(`/api/agent-hub/messages/${id}`),
  });

  // Loading the thread marked its alert read on the server: count the badge down.
  const loaded = Boolean(detail.data);
  useEffect(() => {
    if (!loaded) return;
    void qc.invalidateQueries({ queryKey: THREADS_KEY });
    void qc.invalidateQueries({ queryKey: qk.agentHubNav() });
    // only the first load of a thread needs to refresh the lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const send = async () => {
    setSending(true);
    try {
      await sendJson("/api/agent-hub/messages", "POST", {
        threadId: id,
        body: reply.trim(),
      });
      setReply("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["agent-hub", "thread", id] }),
        qc.invalidateQueries({ queryKey: THREADS_KEY }),
      ]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setSending(false);
    }
  };

  if (detail.isLoading)
    return <span className="ag-convo-state">Loading the thread</span>;
  if (detail.isError || !detail.data) {
    return (
      <span className="ag-convo-state">
        Could not load this thread.{" "}
        <AgBtn tone="text" onClick={() => void detail.refetch()}>
          Try again
        </AgBtn>
      </span>
    );
  }
  return (
    <>
      <ol className="ag-convo-list" aria-label="Messages">
        {task ? (
          <li className="ag-sys">
            <button
              type="button"
              className="ag-card-in"
              data-ag-thread-item={task.id}
              onClick={() => onOpenItem?.(task.id)}
            >
              <span className="ag-ring is-prog" aria-hidden="true" />
              <span>
                <b>{task.title}</b>
                <span>Open the task</span>
              </span>
            </button>
          </li>
        ) : null}
        {detail.data.messages.map((message) => {
          const mine = message.from.kind === "owner";
          const from = mine ? "You" : (message.from.name ?? "agent");
          return (
            <li
              key={message.id}
              className={"ag-msg" + (mine ? " is-mine" : "")}
              data-ag-msg=""
            >
              <span className="ag-msg-head">
                {mine ? null : (
                  <span
                    className="ag-dotc"
                    aria-hidden="true"
                    style={{ background: hue(message.from.name) }}
                  />
                )}
                {`${from}${message.importance === "high" ? " (urgent)" : ""} · ${shortWhen(
                  message.createdAt
                )}`}
              </span>
              <span className="ag-msg-body">{message.body}</span>
              {acks(message) ? (
                <span className="ag-msg-ack">{acks(message).trim()}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <span className="ag-form ag-convo-reply">
        <input
          className="nt-input"
          aria-label="Reply as yourself"
          value={reply}
          maxLength={2000}
          placeholder="Reply to everyone in the thread"
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && reply.trim() && !sending) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <AgBtn disabled={!reply.trim() || sending} onClick={send}>
          Send
        </AgBtn>
      </span>
    </>
  );
}
