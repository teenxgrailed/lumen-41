"use client";

import { useCallback } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

export type RedeemResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * `POST /api/promo/redeem`. The server answers a plain sentence for every
 * refusal (unknown, expired, used up, already used), so it is shown as given.
 */
export async function redeemPromo(code: string): Promise<RedeemResult> {
  try {
    const response = await fetch("/api/promo/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error ?? "Could not apply the code. Try again.",
      };
    }
    return { ok: true, message: body?.message ?? "Code applied." };
  } catch {
    return { ok: false, error: "Could not reach the server. Try again." };
  }
}

/** Redeems a code and refreshes the plan everything else reads. */
export function useRedeemPromo() {
  const qc = useQueryClient();
  return useCallback(
    async (code: string): Promise<RedeemResult> => {
      const result = await redeemPromo(code);
      if (result.ok) {
        await qc.invalidateQueries({ queryKey: qk.plan() });
      }
      return result;
    },
    [qc]
  );
}
