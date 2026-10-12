"use client";

import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FiUpload } from "react-icons/fi";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { type ImportRunSummaryInput, importRunSummary } from "./derive";
import { SBtn, SGroup, SRow } from "./kit";

interface ImportRun extends ImportRunSummaryInput {
  id: string;
  source: "todoist" | "notion";
}

interface ImportsState {
  enabled: boolean;
  sources: { todoist?: { configured: boolean } };
  runs: ImportRun[];
}

const POLL_MS = 2_000;
const SHOWN_WARNINGS = 3;

const isActive = (run?: ImportRun) =>
  run?.status === "queued" || run?.status === "running";

/**
 * Settings → Data → Import. Shown only while the `imports` flag is on for
 * this person. Starting sends the browser through Todoist's consent screen
 * (the callback comes back to `/settings#data`); while a run is queued or
 * running the row polls its progress.
 */
export function ImportGroup() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const state = useQuery({
    queryKey: qk.imports(),
    queryFn: () => fetchJson<ImportsState>("/api/imports"),
    refetchInterval: (query) =>
      isActive(query.state.data?.runs.find((r) => r.source === "todoist"))
        ? POLL_MS
        : false,
  });

  if (!state.data?.enabled) return null;
  const configured = !!state.data.sources.todoist?.configured;
  const last = state.data.runs.find((r) => r.source === "todoist");
  const active = isActive(last);

  const start = async () => {
    setBusy(true);
    try {
      const { authorizeUrl } = await sendJson<{ authorizeUrl: string }>(
        "/api/imports",
        "POST",
        { source: "todoist" }
      );
      window.location.assign(authorizeUrl);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not start the import."
      );
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!last) return;
    setBusy(true);
    try {
      await sendJson(`/api/imports/${last.id}/cancel`, "POST");
      await qc.invalidateQueries({ queryKey: qk.imports() });
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not cancel the import."
      );
    } finally {
      setBusy(false);
    }
  };

  const desc = last
    ? importRunSummary(last)
    : configured
      ? "Projects, sections, tasks, labels and comments. Running it again updates what it brought in."
      : "Not set up on this server yet.";
  const warnings =
    last && !active
      ? last.warnings.filter((w) => w.code !== "warnings_truncated")
      : [];

  return (
    <SGroup title="Import" hint="Bring your work in from another tool.">
      <SRow title="Todoist" desc={desc}>
        {active ? (
          <SBtn disabled={busy} onClick={() => void cancel()}>
            Cancel
          </SBtn>
        ) : (
          <SBtn
            icon={<FiUpload size={14} aria-hidden />}
            disabled={busy || !configured}
            onClick={() => void start()}
          >
            Import from Todoist
          </SBtn>
        )}
      </SRow>
      {warnings.length ? (
        <SRow
          title={`${warnings.length} ${warnings.length === 1 ? "note" : "notes"} from the last import`}
          desc={
            warnings
              .slice(0, SHOWN_WARNINGS)
              .map((w) => w.message)
              .join(" ") +
            (warnings.length > SHOWN_WARNINGS
              ? ` And ${warnings.length - SHOWN_WARNINGS} more.`
              : "")
          }
        />
      ) : null}
    </SGroup>
  );
}
