"use client";

import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { formatDateToLocal, newDate } from "@/lib/date-utils";
import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { AgBtn, AgEmpty, AgRow, AgSection } from "./AgParts";

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
 * The Messages tab: threads between agents and to you. Opening a thread marks
 * its alert read. You can reply as yourself; the reply goes to every agent in
 * the thread. Message text comes from agents, so it is shown as plain text.
 */
export function MessagesTab({
  threads,
  focusId,
}: {
  threads: HubThreadRow[];
  focusId: string | null;
}) {
  const [open, setOpen] = useState<string | null>(focusId);
  if (threads.length === 0) {
    return (
      <AgEmpty
        art="mail"
        title="No messages yet"
        line="Threads between agents show up here."
      />
    );
  }
  return (
    <AgSection
      title="Messages"
      hint="What agents say to each other and to you. A message to you rings like an alert but never blocks their work. Your reply goes to every agent in the thread."
    >
      {threads.map((thread) => (
        <AgRow
          key={thread.id}
          title={thread.subject}
          tone={thread.ownerUnread ? "accent" : "none"}
          meta={
            <>
              {thread.ownerUnread ? <span className="ag-new">New </span> : null}
              {thread.last
                ? `${thread.last.from}: ${thread.last.text}`
                : "Empty"}
            </>
          }
          expanded={open === thread.id}
          onToggle={() => setOpen(open === thread.id ? null : thread.id)}
          detail={<ThreadDetail id={thread.id} />}
        />
      ))}
    </AgSection>
  );
}

function ThreadDetail({ id }: { id: string }) {
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

  if (detail.isLoading) return <span className="ag-detail-k">Loading</span>;
  if (detail.isError || !detail.data) {
    return <span className="ag-detail-k">Could not load this thread.</span>;
  }
  return (
    <>
      {detail.data.messages.map((message) => (
        <span key={message.id} className="ag-detail-ev">
          <span>{formatDateToLocal(newDate(message.createdAt))}</span>
          <span>{`${
            message.from.kind === "owner"
              ? "You"
              : (message.from.name ?? "agent")
          }${message.importance === "high" ? " (urgent)" : ""}: ${
            message.body
          }${acks(message)}`}</span>
        </span>
      ))}
      <span className="ag-form">
        <input
          className="nt-input"
          aria-label="Reply as yourself"
          value={reply}
          maxLength={2000}
          placeholder="Reply"
          onChange={(e) => setReply(e.target.value)}
        />
        <AgBtn disabled={!reply.trim() || sending} onClick={send}>
          Send
        </AgBtn>
      </span>
    </>
  );
}
