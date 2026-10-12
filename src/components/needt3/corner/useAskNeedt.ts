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
import { changedData, readLines, touchedTaskId } from "./stream";

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
    async (raw: string, confirmed = false) => {
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
              : [{ id: uid(), from: "you", text: line, at }, reply]
          )
      );
      setPhase("thinking");
      const ctl = new AbortController();
      abort.current = ctl;
      let text = "";
      let confirm = false;
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
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) error = body.error;
          } catch {
            /* not JSON: keep the stable fallback */
          }
          patch(reply.id, { text: error, failed: true });
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
                const task = touchedTaskId(event);
                const tool = event.toolName ?? "";
                // The hand points at the row the tool touched, so the row has
                // to be on screen first: refetch, let it paint, then look.
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
              }
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

  const reset = React.useCallback(() => {
    abort.current?.abort();
    conversation.current = null;
    setMessages([]);
  }, []);

  return { messages, phase, send, stop, reset };
}
