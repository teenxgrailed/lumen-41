"use client";

import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { FiAlertCircle } from "react-icons/fi";

import { ApiError } from "@/lib/needt3/hooks/core";
import {
  type GoogleTaskList,
  googleTasksListsKey,
  importTaskList,
  stopImportingTaskList,
  useGoogleTaskLists,
} from "@/lib/needt3/hooks/google-tasks";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { SSelect, V3Switch } from "../settings/kit";
import { strings } from "./strings";

/**
 * Which Google task lists come into Needt, and into which project. Switching a
 * list on creates the import (the server starts its first sync); switching it
 * off stops it and leaves the tasks already imported where they are.
 *
 * One body for the desktop sheet and the phone sheet.
 */
export function GoogleTasksLists({
  providerId,
  onReconnect,
}: {
  providerId: string;
  onReconnect: () => void;
}) {
  const qc = useQueryClient();
  const lists = useGoogleTaskLists(providerId);
  const projects = useProjects();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const options = (projects.data ?? []).map((p) => [p.id, p.name] as const);
  const projectId = picked ?? options[0]?.[0] ?? null;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: googleTasksListsKey(providerId) });
    void qc.invalidateQueries({ queryKey: qk.tasks() });
    void qc.invalidateQueries({ queryKey: qk.projects() });
  };

  const toggle = async (list: GoogleTaskList, on: boolean) => {
    if (busy) return;
    setBusy(list.id);
    const r =
      on && projectId
        ? await importTaskList({ providerId, list, projectId })
        : !on && list.mappingId
          ? await stopImportingTaskList(list.mappingId)
          : null;
    setBusy(null);
    if (!r) return;
    if (!r.ok) return void notify.error(r.error);
    notify.success(
      on ? strings.tasksImported(list.name) : strings.tasksStopped(list.name)
    );
    await refresh();
  };

  // Google refused the lists: the grant is gone, so the only way on is to connect again.
  const reauth = lists.error instanceof ApiError && lists.error.status === 401;
  const imported = (lists.data ?? []).filter((l) => l.isMapped).length;

  return (
    <div className="cn-caldav" data-cn-gtasks="">
      <span className="cn-meta">{strings.tasksLead}</span>
      {lists.isPending ? (
        <span className="cn-meta" role="status" data-cn-gtasks-loading="">
          {strings.tasksLoading}
        </span>
      ) : reauth ? (
        <>
          <span className="cn-caldav-note is-bad" role="alert">
            <FiAlertCircle size={14} aria-hidden />
            {strings.tasksReauth}
          </span>
          <div className="cn-caldav-foot">
            <span className="cn-caldav-foot-gap" />
            <button
              type="button"
              className="nx-btn nx-btn-primary"
              data-cn-gtasks-reconnect=""
              onClick={onReconnect}
            >
              {strings.tasksReconnect}
            </button>
          </div>
        </>
      ) : lists.isError ? (
        <>
          <span className="cn-caldav-note is-bad" role="alert">
            <FiAlertCircle size={14} aria-hidden />
            {strings.tasksFailed}
          </span>
          <div className="cn-caldav-foot">
            <span className="cn-caldav-foot-gap" />
            <button
              type="button"
              className="nx-btn nx-btn-text"
              onClick={() => void lists.refetch()}
            >
              {strings.tasksRetry}
            </button>
          </div>
        </>
      ) : !lists.data?.length ? (
        <span className="cn-meta" data-cn-gtasks-empty="">
          {strings.tasksNoLists}
        </span>
      ) : !options.length && !projects.isPending ? (
        <span className="cn-meta" data-cn-gtasks-empty="">
          {strings.tasksNoProjects}
        </span>
      ) : (
        <>
          <div className="nt-form">
            <div className="nt-row">
              <span className="nt-row-label">{strings.tasksProject}</span>
              <div className="nt-row-control">
                <SSelect
                  value={projectId ?? ""}
                  options={options}
                  onChange={setPicked}
                  width="100%"
                  label={strings.tasksProjectLabel}
                  disabled={projects.isPending}
                />
              </div>
            </div>
            {lists.data.map((list) => (
              <div
                className="nt-row"
                key={list.id}
                data-cn-gtasks-list={list.id}
              >
                <span className="nt-row-label" title={list.projectName}>
                  {list.name || "Tasks"}
                </span>
                <div className="nt-row-control">
                  <V3Switch
                    checked={list.isMapped}
                    label={`Import ${list.name || "Tasks"}`}
                    disabled={busy !== null || (!list.isMapped && !projectId)}
                    onChange={(on) => void toggle(list, on)}
                  />
                </div>
              </div>
            ))}
          </div>
          <span className="cn-meta" data-cn-gtasks-summary="">
            {strings.tasksSummary(imported)}
          </span>
        </>
      )}
    </div>
  );
}
