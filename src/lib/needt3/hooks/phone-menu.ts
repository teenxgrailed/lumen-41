"use client";

import { useCallback } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { serialByKey } from "@/lib/needt3/serial";
import { notify } from "@/lib/notifications";
import {
  type MenuLayout,
  type MenuLayoutPatch,
  layoutFromRow,
} from "@/lib/phone-menu/layout";

import { fetchJson, sendJson } from "./core";

/**
 * The phone app menu of this account (`GET /api/phone-menu`): its look
 * ("tiles" or the older "card") and the ordered tiles. The server holds it, so
 * the same menu follows the person to every device.
 */
export function usePhoneMenu() {
  return useQuery({
    queryKey: qk.phoneMenu(),
    queryFn: async (): Promise<MenuLayout> =>
      layoutFromRow(await fetchJson<MenuLayout>("/api/phone-menu")),
    staleTime: 5 * 60_000,
  });
}

/**
 * Saves a change to the menu. The screen follows at once; the writes go one
 * after another so the last answer is the last change, and a refusal puts the
 * menu back and says so. Resolves true when it was stored.
 */
export function useSavePhoneMenu() {
  const qc = useQueryClient();
  return useCallback(
    async (patch: MenuLayoutPatch): Promise<boolean> => {
      const before = qc.getQueryData<MenuLayout>(qk.phoneMenu());
      const base = before ?? layoutFromRow(null);
      qc.setQueryData<MenuLayout>(qk.phoneMenu(), {
        style: patch.style ?? base.style,
        tiles: patch.tiles ?? base.tiles,
      });
      try {
        const saved = await serialByKey("phone-menu", () =>
          sendJson<MenuLayout>("/api/phone-menu", "PUT", patch)
        );
        qc.setQueryData<MenuLayout>(qk.phoneMenu(), layoutFromRow(saved));
        return true;
      } catch {
        qc.setQueryData(qk.phoneMenu(), before);
        notify.error("Couldn't save your menu. Try again.");
        return false;
      }
    },
    [qc]
  );
}
