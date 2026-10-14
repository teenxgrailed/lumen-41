"use client";

import { Fragment, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FiUpload } from "react-icons/fi";

import { BrandIcon } from "@/components/needt3/brand";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useAdmin } from "@/hooks/use-admin";

import { type ImportRunSummaryInput, importRunSummary } from "./derive";
import { SBtn, SGroup, SRow } from "./kit";

type SourceId = "todoist" | "notion";

interface ImportRun extends ImportRunSummaryInput {
  id: string;
  source: SourceId;
}

interface ImportsState {
  enabled: boolean;
  sources: Partial<Record<SourceId, { configured: boolean }>>;
  runs: ImportRun[];
}

const POLL_MS = 2_000;
const SHOWN_WARNINGS = 3;

const SOURCES: ReadonlyArray<{
  id: SourceId;
  label: string;
  /** Shown before any import has run. */
  intro: string;
  /** What the server needs for the consent screen (names only). */
  needs: string;
}> = [
  {
    id: "todoist",
    label: "Todoist",
    intro:
      "Projects, sections, tasks, labels and comments. Running it again updates what it brought in.",
    needs: "TODOIST_CLIENT_ID and TODOIST_CLIENT_SECRET",
  },
  {
    id: "notion",
    label: "Notion",
    intro:
      "Pages and databases, with their pictures and files. You pick the pages in Notion; only those are imported. Running it again updates what changed.",
    needs: "NOTION_CLIENT_ID and NOTION_CLIENT_SECRET",
  },
];

const isActive = (run?: ImportRun) =>
  run?.status === "queued" || run?.status === "running";

/**
 * Settings → Data → Import. Shown only while the `imports` flag is on for
 * this person. Starting sends the browser through the source's consent screen
 * (the callback comes back to `/settings#data`); while a run is queued or
 * running the row polls its progress.
 */
export function ImportGroup() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<SourceId | null>(null);
  const { isAdmin } = useAdmin();
  const state = useQuery({
    queryKey: qk.imports(),
    queryFn: () => fetchJson<ImportsState>("/api/imports"),
    refetchInterval: (query) =>
      SOURCES.some((s) => isActive(latest(query.state.data?.runs, s.id)))
        ? POLL_MS
        : false,
  });

  if (!state.data?.enabled) return null;

  // A source this server cannot start is a dead row. The admin sees it, with
  // what to add; everyone else does not, unless it has already run.
  const sources = SOURCES.filter(
    (s) =>
      isAdmin ||
      state.data?.sources[s.id]?.configured ||
      latest(state.data?.runs, s.id)
  );
  if (!sources.length) return null;

  const start = async (source: SourceId) => {
    setBusy(source);
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
      setBusy(null);
    }
  };

  const cancel = async (run: ImportRun) => {
    setBusy(run.source);
    try {
      await sendJson(`/api/imports/${run.id}/cancel`, "POST");
      await qc.invalidateQueries({ queryKey: qk.imports() });
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not cancel the import."
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <SGroup
      title="Import"
      hint="Bring your work in from another tool. From Notion, you pick the pages in Notion itself, and only those are imported."
    >
      {sources.map((source) => {
        const configured = !!state.data?.sources[source.id]?.configured;
        const last = latest(state.data?.runs, source.id);
        const active = isActive(last);
        const desc = last
          ? importRunSummary(last)
          : configured
            ? source.intro
            : `Needs ${source.needs} on the server.`;
        const warnings =
          last && !active
            ? last.warnings.filter((w) => w.code !== "warnings_truncated")
            : [];
        return (
          <Fragment key={source.id}>
            <SRow
              title={source.label}
              desc={desc}
              lead={<BrandIcon id={source.id} size={28} />}
            >
              {active && last ? (
                <SBtn
                  disabled={busy === source.id}
                  onClick={() => void cancel(last)}
                >
                  Cancel
                </SBtn>
              ) : (
                <SBtn
                  icon={<FiUpload size={14} aria-hidden />}
                  disabled={busy !== null || !configured}
                  onClick={() => void start(source.id)}
                >
                  Import from {source.label}
                </SBtn>
              )}
            </SRow>
            {warnings.length ? (
              <SRow
                title={`${warnings.length} ${warnings.length === 1 ? "note" : "notes"} from the last ${source.label} import`}
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
          </Fragment>
        );
      })}
    </SGroup>
  );
}

/** The newest run of a source (the API lists newest first). */
function latest(runs: ImportRun[] | undefined, source: SourceId) {
  return runs?.find((r) => r.source === source);
}
