"use client";

import { useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LuImport } from "react-icons/lu";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { csvToImport, parseCsv } from "@/lib/needt3/import-csv";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { RichMenu } from "../menu/RichMenu";
import {
  type ImportsState,
  type SourceId,
  importMenuItems,
} from "./import-sources";

/**
 * Icon-only at rest; the label slides out on hover and focus (shell.css
 * `.sb-reveal`). Notion and Todoist rows appear while Import is on and the
 * server has them set up; a CSV of tasks always works; Markdown, Google Docs
 * and .ics are listed as "Soon".
 */
export function ImportMenu() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const state = useQuery({
    queryKey: qk.imports(),
    queryFn: () => fetchJson<ImportsState>("/api/imports"),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const start = async (source: SourceId) => {
    if (busy) return;
    setBusy(true);
    try {
      const { authorizeUrl } = await sendJson<{ authorizeUrl: string }>(
        "/api/imports",
        "POST",
        { source }
      );
      window.location.assign(authorizeUrl);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not start the import."
      );
      setBusy(false);
    }
  };

  const importCsv = async (picked: File) => {
    try {
      const body = csvToImport(parseCsv(await picked.text()));
      if (!body.tasks.length) {
        notify.info("No tasks found in that file");
        return;
      }
      const { imported } = await sendJson<{ imported: number }>(
        "/api/import/tasks",
        "POST",
        body
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.tasks() }),
        qc.invalidateQueries({ queryKey: qk.projects() }),
      ]);
      notify.success(
        `Imported ${imported} ${imported === 1 ? "task" : "tasks"}`
      );
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Couldn't import that file"
      );
    }
  };

  const items = importMenuItems(state.data, {
    start: (s) => void start(s),
    csv: () => file.current?.click(),
  });
  return (
    <>
      <RichMenu
        up
        small
        prompt="Where would you like to import from?"
        width={264}
        trigger={(open) => (
          <button
            type="button"
            aria-expanded={open}
            data-sb-import=""
            className={`nx-press sb-reveal sb-import${open ? " is-open" : ""}`}
          >
            <LuImport size={16} />
            <span className="sb-reveal-label">Import</span>
          </button>
        )}
        items={items}
      />
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        hidden
        data-sb-import-csv=""
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void importCsv(picked);
        }}
      />
    </>
  );
}
