"use client";

import { useCallback, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { fetchJson, sendJson } from "./core";

/**
 * THE DAY'S NOTE. A document in the person's own pages (so it is theirs to
 * read and write through the API like any other), titled for the day. Home's
 * "Notes for the day" finds today's by that title and opens it, or makes it
 * the first time. Renaming it detaches it: the next tap starts a new one.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Daily note · 14 October 2026" for "2026-10-14". */
export function dailyNoteTitle(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `Daily note · ${d} ${MONTHS[(m ?? 1) - 1] ?? ""} ${y}`;
}

interface PageRow {
  id: string;
  title: string;
  trashedAt?: string | null;
}

/** The id of today's note among the pages, or null. Trash never counts. */
export function findDailyNote(
  pages: readonly PageRow[],
  day: string
): string | null {
  const title = dailyNoteTitle(day);
  return pages.find((p) => p.title === title && !p.trashedAt)?.id ?? null;
}

async function lookup(day: string): Promise<string | null> {
  const { pages } = await fetchJson<{ pages: PageRow[] }>(
    `/api/pages?preview=false&q=${encodeURIComponent(dailyNoteTitle(day))}`
  );
  return findDailyNote(pages, day);
}

/**
 * `open()` resolves to the page id of `day`'s note, creating it when there is
 * none; `null` when it could not (the person has been told). `exists` says
 * whether the note is already there, for the line's wording.
 */
export function useDailyNote(day: string) {
  const qc = useQueryClient();
  const exists = useQuery({
    queryKey: qk.dailyNote(day),
    queryFn: async () => (await lookup(day)) != null,
    staleTime: 60_000,
  });
  const [busy, setBusy] = useState(false);
  const going = useRef(false);

  const open = useCallback(async (): Promise<string | null> => {
    if (going.current) return null;
    going.current = true;
    setBusy(true);
    try {
      const found = await lookup(day);
      if (found) return found;
      const { page } = await sendJson<{ page: PageRow }>(
        "/api/pages",
        "POST",
        // private: the day's note is the person's own, not the workspace's
        { title: dailyNoteTitle(day), isPrivate: true }
      );
      qc.setQueryData(qk.dailyNote(day), true);
      void qc.invalidateQueries({ queryKey: qk.docs() });
      return page.id;
    } catch {
      notify.error("Could not open today's note.");
      return null;
    } finally {
      going.current = false;
      setBusy(false);
    }
  }, [qc, day]);

  /** Adds Markdown to the end of the day's note (making it first if needed). */
  const append = useCallback(
    async (text: string): Promise<boolean> => {
      const id = await open();
      if (!id) return false;
      try {
        await sendJson(`/api/pages/${id}/append`, "POST", { text });
        void qc.invalidateQueries({ queryKey: qk.docs() });
        return true;
      } catch {
        notify.error("Could not save the note.");
        return false;
      }
    },
    [open, qc]
  );

  return { open, append, busy, exists: exists.data === true };
}
