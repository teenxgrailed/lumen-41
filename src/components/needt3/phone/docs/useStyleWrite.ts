"use client";

import { useCallback } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/needt3/hooks/core";
import { useUpdateDoc } from "@/lib/needt3/hooks/docs";
import { usePlan } from "@/lib/needt3/hooks/plan";
import type { V3Doc } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { docsCopy } from "../../docs/DocParts";
import { proStyleChanges } from "../../docs/pro-style";
import { type DocStyle, presetPatch, stylePatch } from "../../docs/style";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { needsPro, planIsPro } from "./logic";

/** The feature the paywall names when a document theme asks for Pro. */
export const THEMES_FEATURE = "Document themes";

/** Upload a cover picture as a page asset; resolves to its URL (the desktop Style panel's call). */
async function uploadCover(pageId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/pages/${pageId}/assets`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return ((await res.json()) as { url: string }).url;
}

/**
 * Writes for the phone's Page Style sheet, on the desktop Style panel's rules
 * (`document/StylePanel`): the whole `style` object goes through `useUpdateDoc`
 * (optimistic, with Undo); a Pro value on a plan that is Free, or not loaded
 * yet, opens the paywall instead of writing; a 403 UPGRADE_REQUIRED from the
 * server (a stale plan) refreshes the plan and opens it too.
 */
export function useStyleWrite(doc: V3Doc) {
  const update = useUpdateDoc();
  const qc = useQueryClient();
  const plan = usePlan();
  const openPaywall = usePhoneOverlays((s) => s.openPaywall);
  const pro = planIsPro(plan.data?.kind);

  const toPaywall = useCallback(
    () => openPaywall(THEMES_FEATURE),
    [openPaywall]
  );

  const write = useCallback(
    (patch: Partial<Pick<V3Doc, "style" | "coverUrl">>, toast?: string) =>
      void update
        .mutateAsync({ id: doc.id, patch })
        .then(({ undo }) => {
          if (toast) snack(toast, undo);
        })
        .catch((error: unknown) => {
          // The mutation already put the optimistic change back.
          if (
            error instanceof ApiError &&
            error.status === 403 &&
            error.message === "UPGRADE_REQUIRED"
          ) {
            void qc.invalidateQueries({ queryKey: qk.plan() });
            toPaywall();
          }
        }),
    [doc.id, qc, toPaywall, update]
  );

  /** One style change; false when the plan stopped it (the paywall is up). */
  const set = useCallback(
    (p: Partial<DocStyle>, toast?: string) => {
      if (!pro && needsPro(doc, p)) {
        toPaywall();
        return false;
      }
      write(stylePatch(doc, p), toast);
      return true;
    },
    [doc, pro, toPaywall, write]
  );

  /** "All Styles": a preset's four keys together. */
  const preset = useCallback(
    (id: string, name: string) => {
      const patch = presetPatch(doc, id);
      if (!patch) return false;
      if (!pro && proStyleChanges(doc.style, patch.style).length > 0) {
        toPaywall();
        return false;
      }
      write(patch, `Style: ${name}`);
      return true;
    },
    [doc, pro, toPaywall, write]
  );

  /** A picture from the person's files becomes the cover. */
  const cover = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      void uploadCover(doc.id, file)
        // Patch over the document as it is when the upload lands, not as it
        // was when the file was picked: style edits made meanwhile survive.
        .then((url) =>
          write(
            stylePatch(qc.getQueryData<V3Doc>(qk.doc(doc.id)) ?? doc, {
              cover: url,
            }),
            docsCopy.DcStylePanel.cover_added
          )
        )
        .catch(() => notify.error("Could not upload the picture."));
    },
    [doc, qc, write]
  );

  return { pro, set, preset, cover };
}
