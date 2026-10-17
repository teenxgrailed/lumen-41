"use client";

import { useState } from "react";

import { FiDownload } from "react-icons/fi";

import { sendJson } from "@/lib/needt3/hooks/core";
import { useClearSample, useSampleStatus } from "@/lib/needt3/hooks/sample";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";

import { ImportGroup } from "./ImportGroup";
import { useMark } from "./SettingsContext";
import { readPref } from "./derive";
import { SBtn, SGroup, SRow, V3Switch } from "./kit";

/**
 * Data & privacy. Export tasks and the full export use the routes the old
 * Settings uses; the rest of the prototype's rows have nothing behind them.
 * Import from Todoist and Notion sits behind the `imports` flag (ImportGroup).
 * Tasks download as CSV or JSON (`/api/export/tasks`).
 * //todo: Documents as Markdown (no per-page export route yet; Export all has
 * them), the rest of the Import menu (Markdown, Google Docs, .ics, CSV:
 * import.jsx).
 */
export function DataSection() {
  const mark = useMark();
  const settings = useSettings();
  const setPref = useSetPref();
  const [busy, setBusy] = useState<"all" | null>(null);
  const sample = useSampleStatus();
  const clearSample = useClearSample();

  const requestAll = async () => {
    setBusy("all");
    try {
      await sendJson("/api/account/export", "POST");
      notify.success("Export requested. We will email you a download link.");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not start the export."
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SGroup
        title="Export"
        hint="Everything you have in Needt is yours to take with you."
      >
        <SRow
          title="Tasks"
          desc="Every task with its project, estimate and dates."
        >
          <a
            className="nx-btn nx-btn-secondary"
            href="/api/export/tasks?includeCompleted=true&format=csv"
            download="needt-tasks.csv"
            data-settings-export-csv=""
          >
            <FiDownload size={14} aria-hidden />
            CSV
          </a>
          <a
            className="nx-btn nx-btn-secondary"
            href="/api/export/tasks?includeCompleted=true"
            download="needt-tasks.json"
          >
            <FiDownload size={14} aria-hidden />
            JSON
          </a>
        </SRow>
        <SRow
          title="Export all"
          desc="Tasks, documents, habits, boards and settings in one file, sent by email."
        >
          <SBtn
            icon={<FiDownload size={14} aria-hidden />}
            disabled={busy === "all"}
            onClick={() => void requestAll()}
          >
            Email me the export
          </SBtn>
        </SRow>
      </SGroup>
      {sample.data?.present ? (
        <SGroup title="Examples">
          <SRow
            title="Clear examples"
            desc="Removes the sample project, tasks, document and habit from your first day. Anything you made yourself stays."
          >
            <SBtn
              disabled={clearSample.isPending}
              onClick={() => clearSample.mutate()}
            >
              Clear examples
            </SBtn>
          </SRow>
        </SGroup>
      ) : null}
      <ImportGroup />
      <SGroup title="Privacy">
        <SRow
          title="Share usage data"
          desc="Anonymous counts of which features get used. Never the content of your tasks, documents or mail."
        >
          <V3Switch
            label="Share usage data"
            checked={readPref(settings.data?.prefs, "usage")}
            disabled={!settings.data}
            onChange={(v) =>
              void setPref("usage", v).then((saved) => saved && mark())
            }
          />
        </SRow>
      </SGroup>
      {/* //todo: "This device → Download everything again". A safe version
          first runs NEEDT_SYNC_NOW so the outbox drains, then refetches; it
          must never call clearNeedtOfflineData(), which also wipes the
          outbox queue, page drafts and task templates (unsent work). */}
    </>
  );
}
