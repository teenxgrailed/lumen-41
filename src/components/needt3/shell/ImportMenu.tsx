"use client";

/* IMPORT (prototype Sidebar.jsx): an icon at the foot of the rail whose label
   slides out under the hand, and the menu "Where would you like to import
   from?". Only the rows with something behind them do anything; see
   ./import-menu for which. */
import { useRef } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LuImport } from "react-icons/lu";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { csvToImport, parseCsv } from "@/lib/needt3/import-csv";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { RichMenu } from "../menu/RichMenu";
import {
  IMPORT_PROMPT,
  type ImportKind,
  type ImportsFacts,
  importRows,
} from "./import-menu";

export function ImportMenu() {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const imports = useQuery({
    queryKey: qk.imports(),
    queryFn: () => fetchJson<ImportsFacts>("/api/imports"),
    staleTime: 5 * 60_000,
  });

  async function startNotion() {
    try {
      const { authorizeUrl } = await sendJson<{ authorizeUrl: string }>(
        "/api/imports",
        "POST",
        { source: "notion" }
      );
      window.location.assign(authorizeUrl);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not start the import."
      );
    }
  }

  async function importCsv(picked: File) {
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
  }

  const run = (kind: ImportKind) => {
    if (kind === "notion") void startNotion();
    else if (kind === "csv") file.current?.click();
  };

  return (
    <>
      <RichMenu
        up
        small
        prompt={IMPORT_PROMPT}
        width={264}
        trigger={(open) => (
          /* Icon-only at rest; the label is the name, so no aria-label. */
          <button
            type="button"
            aria-expanded={open}
            data-sb-import=""
            className={`nx-press sb-reveal sb-import${open ? " is-open" : ""}`}
          >
            <LuImport size={16} aria-hidden />
            <span className="sb-reveal-label">Import</span>
          </button>
        )}
        items={importRows(imports.data).map((row) => ({
          art: row.art,
          title: row.title,
          kbd: row.note,
          disabled: !row.backed,
          onClick: () => run(row.kind),
        }))}
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
