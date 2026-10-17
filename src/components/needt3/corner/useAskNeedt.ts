"use client";

/* ASK NEEDT'S CONVERSATION — replies come from the existing /api/ai/chat
 * stream (NDJSON: one `meta` line, then `token` lines), not the prototype's
 * scripted `chatReply`.
 *
 * `phase` drives the only motion that may loop: the orb, the shimmering
 * "Thinking…" line and the caret run while it is "thinking" or "streaming"
 * and stop when it is idle.
 */
import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

import { runAgent } from "../cursor/hand";
import {
  type ChatAction,
  type ChatSource,
  changedData,
  readLines,
  touchedTaskId,
} from "./stream";

const LOG_SOURCE = "needt3-ask";

export interface AskMessage {
  id: string;
  from: "you" | "needt";
  text: string;
  at: number;
  stopped?: boolean;
  /** The reply asked to confirm an action before it runs. */
  confirm?: string;
  /** The reply failed before any text arrived. */
  failed?: boolean;
  /** The plan does not include the agent (Free): the reply is the reason. */
  upgrade?: boolean;
  /** Tool progress, in order: one line each while it runs, then its outcome. */
  tools?: AskTool[];
  /** What the agent changed this turn; each can be undone. */
  actions?: AskAction[];
  /** The run the actions belong to ("Undo all"). */
  runId?: string | null;
  /** The objects the answer read. */
  sources?: ChatSource[];
}

export interface AskTool {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "error";
}

export interface AskAction extends ChatAction {
  state: "applied" | "undone" | "conflict" | "failed";
}

export type AskPhase = "idle" | "thinking" | "streaming";

let seq = 0;
function uid(): string {
  seq += 1;
  return `ask-${seq}`;
}

const FAILED = "I could not reach the AI provider. Try again.";

export function useAskNeedt() {
  const qc = useQueryClient();
  const [messages, setMessages] = React.useState<AskMessage[]>([]);
  const [phase, setPhase] = React.useState<AskPhase>("idle");
  const conversation = React.useRef<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abort.current?.abort(), []);

  const patch = React.useCallback(
    (id: string, next: Partial<AskMessage>) =>
      setMessages((list) =>
        list.map((m) => (m.id === id ? { ...m, ...next } : m))
      ),
    []
  );

  const send = React.useCallback(
    async (raw: string, confirmed = false, shown?: string) => {
      const line = raw.trim();
      if (!line || abort.current) return;
      const at = newDate().getTime();
      const reply: AskMessage = { id: uid(), from: "needt", text: "", at };
      setMessages((list) =>
        list
          .map((m) => (m.confirm ? { ...m, confirm: undefined } : m))
          .concat(
            confirmed
              ? [reply]
              : [{ id: uid(), from: "you", text: shown ?? line, at }, reply]
          )
      );
      setPhase("thinking");
      const ctl = new AbortController();
      abort.current = ctl;
      let text = "";
      let confirm = false;
      const tools: AskTool[] = [];
      /** Refetch, let the row paint, then point the hand at it. */
      const showChange = (task: string | null, tool: string) => {
        void (async () => {
          await qc.invalidateQueries({ queryKey: ["v3"] });
          if (!task) return;
          await new Promise((r) => window.requestAnimationFrame(r));
          const target = `[data-task="${CSS.escape(task)}"]`;
          if (!document.querySelector(target)) return;
          await runAgent({
            label: tool || "agent",
            steps: [
              {
                target,
                act: { kind: "rest" },
                say: tool.replace(/_/g, " "),
              },
            ],
          });
        })();
      };
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.current ?? undefined,
            message: line,
            confirmed,
          }),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          let error = FAILED;
          let upgrade = false;
          try {
            const body = (await res.json()) as {
              error?: string;
              upgradeRequired?: boolean;
            };
            if (body.error) error = body.error;
            upgrade = body.upgradeRequired === true;
          } catch {
            /* not JSON: keep the stable fallback */
          }
          patch(reply.id, { text: error, failed: true, upgrade });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = readLines(buffer);
          buffer = rest;
          for (const event of events) {
            if (event.type === "meta") {
              conversation.current =
                event.conversationId ?? conversation.current;
              confirm = !!event.requiresConfirm;
              if (changedData(event)) {
                // The hand points at the row the tool touched, so the row has
                // to be on screen first.
                showChange(touchedTaskId(event), event.toolName ?? "");
              }
              continue;
            }
            if (event.type === "tool") {
              const at = tools.findIndex((t) => t.id === event.id);
              const next: AskTool = {
                id: event.id,
                name: event.name,
                label: event.label,
                status: event.status,
              };
              if (at >= 0) tools[at] = next;
              else tools.push(next);
              patch(reply.id, { tools: [...tools] });
              continue;
            }
            if (event.type === "done") {
              confirm = event.requiresConfirm;
              patch(reply.id, {
                runId: event.runId,
                actions: event.actions.map((a) => ({
                  ...a,
                  state: "applied" as const,
                })),
                sources: event.sources,
              });
              if (event.changed) showChange(event.taskId, "agent");
              continue;
            }
            text += event.value ?? "";
            setPhase("streaming");
            patch(reply.id, { text });
          }
        }
        patch(reply.id, {
          text: text.trim() ? text : FAILED,
          failed: !text.trim(),
          confirm: confirm ? line : undefined,
        });
      } catch (error) {
        if (ctl.signal.aborted) {
          patch(reply.id, {
            text: text ? `${text.trimEnd()}…` : "Stopped before answering.",
            stopped: true,
          });
        } else {
          logger.warn(
            "Ask Needt request failed",
            { error: error instanceof Error ? error.message : String(error) },
            LOG_SOURCE
          );
          patch(reply.id, { text: FAILED, failed: true });
        }
      } finally {
        // A later request may own the slot by now; leave it alone.
        if (abort.current === ctl) {
          abort.current = null;
          setPhase("idle");
        }
      }
    },
    [patch, qc]
  );

  const stop = React.useCallback(() => abort.current?.abort(), []);

  const setActionState = React.useCallback(
    (messageId: string, ids: "all" | string, state: AskAction["state"]) =>
      setMessages((list) =>
        list.map((m) =>
          m.id === messageId
            ? {
                ...m,
                actions: m.actions?.map((a) =>
                  (ids === "all" && a.state === "applied") || a.actionId === ids
                    ? { ...a, state }
                    : a
                ),
              }
            : m
        )
      ),
    []
  );

  /** Undo one thing the agent did (POST /api/agent/actions/:id/undo). */
  const undo = React.useCallback(
    async (messageId: string, actionId: string) => {
      try {
        const res = await fetch(`/api/agent/actions/${actionId}/undo`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          status?: string;
        };
        const ok = res.ok && body.status !== "not_undoable";
        setActionState(
          messageId,
          actionId,
          ok ? "undone" : res.status === 409 ? "conflict" : "failed"
        );
        if (ok) await qc.invalidateQueries({ queryKey: ["v3"] });
      } catch {
        setActionState(messageId, actionId, "failed");
      }
    },
    [qc, setActionState]
  );

  /** Undo everything this turn did, newest first (POST /api/agent/runs/:id/undo). */
  const undoAll = React.useCallback(
    async (messageId: string, runId: string) => {
      try {
        const res = await fetch(`/api/agent/runs/${runId}/undo`, {
          method: "POST",
        });
        setActionState(
          messageId,
          "all",
          res.ok ? "undone" : res.status === 409 ? "conflict" : "failed"
        );
        await qc.invalidateQueries({ queryKey: ["v3"] });
      } catch {
        setActionState(messageId, "all", "failed");
      }
    },
    [qc, setActionState]
  );

  const reset = React.useCallback(() => {
    abort.current?.abort();
    conversation.current = null;
    setMessages([]);
  }, []);

  /**
   * Take the last thing you said (and everything after it) back off the
   * thread so it can be edited and sent again (↑ in an empty field). Nothing
   * while a reply is on its way.
   */
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const popLast = React.useCallback((): string | null => {
    if (abort.current) return null;
    const list = messagesRef.current;
    let i = list.length - 1;
    while (i >= 0 && list[i].from !== "you") i -= 1;
    if (i < 0) return null;
    setMessages(list.slice(0, i));
    return list[i].text;
  }, []);

  return { messages, phase, send, stop, reset, popLast, undo, undoAll };
}
