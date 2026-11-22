"use client";

import { useCallback, useState } from "react";

import {
  FEEDBACK_KINDS,
  type FeedbackKind,
} from "@/services/feedback/eligibility";

export interface OfferedPrompt {
  id: string;
  kind: FeedbackKind;
}

export interface FeedbackAnswer {
  rating?: number;
  score?: number;
  text?: string;
}

export type SendResult = { ok: true; review: boolean } | { ok: false };

function isOffered(value: unknown): value is OfferedPrompt {
  const v = value as Partial<OfferedPrompt> | null;
  return (
    !!v &&
    typeof v.id === "string" &&
    (FEEDBACK_KINDS as readonly string[]).includes(v.kind as string)
  );
}

/**
 * The calls behind the feedback popup. Plain `fetch`, not the offline-aware
 * client: a prompt that cannot be fetched or answered right now is simply not
 * shown or not saved, never queued for later.
 */
export function useFeedbackPrompt() {
  const [prompt, setPrompt] = useState<OfferedPrompt | null>(null);

  const fetchPrompt = useCallback(
    async (context: {
      platform: string;
      appVersion: string;
    }): Promise<OfferedPrompt | null | "failed"> => {
      try {
        const query = new URLSearchParams({
          platform: context.platform,
          appVersion: context.appVersion,
        });
        const res = await fetch(`/api/feedback/prompt?${query}`, {
          cache: "no-store",
        });
        if (!res.ok) return "failed";
        const body = (await res.json()) as { prompt?: unknown };
        if (body.prompt === null) return null;
        if (!isOffered(body.prompt)) return "failed";
        setPrompt(body.prompt);
        return body.prompt;
      } catch {
        return "failed";
      }
    },
    []
  );

  const send = useCallback(
    async (id: string, answer: FeedbackAnswer): Promise<SendResult> => {
      try {
        const res = await fetch(`/api/feedback/prompt/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "answer", ...answer }),
        });
        if (!res.ok) return { ok: false };
        const body = (await res.json()) as { review?: unknown };
        return { ok: true, review: body.review === true };
      } catch {
        return { ok: false };
      }
    },
    []
  );

  /** Best effort: a dismissal that does not reach the server costs nothing. */
  const dismiss = useCallback(async (id: string): Promise<void> => {
    try {
      await fetch(`/api/feedback/prompt/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
        keepalive: true,
      });
    } catch {
      // the row already counts as shown
    }
  }, []);

  return { prompt, setPrompt, fetchPrompt, send, dismiss };
}
