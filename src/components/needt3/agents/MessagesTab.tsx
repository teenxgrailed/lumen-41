"use client";

import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { AgBtn, shortWhen, useAgentHue } from "./AgParts";

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
 * One thread: its messages as bubbles, the item it hangs on as a card, and
 * a reply line (`withReply`; Chat sends from its own line). Loading it marks
 * its alert read. Message text comes from agents, so it is plain text.
 */
export function ThreadDetail({
  id,
  task,
  onOpenItem,
  withReply = true,
}: {
  id: string;
  task: { id: string; title: string } | null;
  onOpenItem?: (id: string) => void;
  withReply?: boolean;
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
      {withReply ? (
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
      ) : null}
    </>
  );
}
