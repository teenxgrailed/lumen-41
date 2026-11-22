"use client";

import { useEffect, useState } from "react";

import { FiX } from "react-icons/fi";

import { sendJson } from "@/lib/needt3/hooks/core";

import { Sheet } from "../ctx/Sheet";
import { AgBtn } from "./AgParts";
import type { HubAgentRow } from "./AgentsTab";
import {
  EMPTY_NEW_TASK,
  NEW_TASK_RISKS,
  type NewTaskForm,
  newTaskPayload,
  newTaskProblem,
} from "./new-task";

/**
 * "New task" for the owner: one brief handed to an agent, created through
 * the same route and rules as `needt_agent_task_create`. One form-row
 * geometry (label over field), three fields to fill, the rest optional.
 */
export function NewTaskSheet({
  open,
  agents,
  onClose,
  run,
}: {
  open: boolean;
  /** The live agents; the Needt assistant takes no work, so it is not offered. */
  agents: HubAgentRow[];
  onClose: () => void;
  run: (task: () => Promise<unknown>, done?: string) => Promise<unknown>;
}) {
  const [form, setForm] = useState<NewTaskForm>(EMPTY_NEW_TASK);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const offered = agents.filter(
    (a) => !a.disabled && !a.disabledAt && a.connection !== "Needt assistant"
  );

  // A fresh form each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_NEW_TASK);
    setTouched(false);
    setBusy(false);
  }, [open]);

  const set = <K extends keyof NewTaskForm>(key: K, value: NewTaskForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const problem = newTaskProblem(form);

  const submit = async () => {
    setTouched(true);
    if (problem || busy) return;
    setBusy(true);
    const ok = await run(
      () => sendJson("/api/agent-hub/items", "POST", newTaskPayload(form)),
      "Task created"
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New task"
      scrimClassName="tdc-scrim"
      className="tdc-card ag-night ag-sheet"
    >
      <form
        className="ag-sheet-in"
        data-ag-new-task=""
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="ag-sheet-head">
          <h2 className="ag-h">New task</h2>
          <button
            type="button"
            className="cn-iconbtn"
            aria-label="Close"
            onClick={onClose}
          >
            <FiX size={14} aria-hidden />
          </button>
        </div>
        <div className="ag-sheet-body">
          <label className="ag-field">
            <span>Title</span>
            <input
              className="nt-input"
              value={form.title}
              maxLength={200}
              autoFocus
              data-ag-new-title=""
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label className="ag-field">
            <span>Goal</span>
            <textarea
              className="nt-input ag-area"
              rows={3}
              value={form.goal}
              maxLength={4000}
              placeholder="What should the agent get done?"
              data-ag-new-goal=""
              onChange={(e) => set("goal", e.target.value)}
            />
          </label>
          <label className="ag-field">
            <span>Done when</span>
            <input
              className="nt-input"
              value={form.done}
              maxLength={2000}
              placeholder="How you will know it is finished"
              data-ag-new-done=""
              onChange={(e) => set("done", e.target.value)}
            />
          </label>
          <label className="ag-field">
            <span>Agent</span>
            <select
              className="nt-input"
              value={form.agent}
              data-ag-new-agent=""
              onChange={(e) => set("agent", e.target.value)}
            >
              <option value="any">Any capable agent</option>
              {offered.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {form.agent === "any" ? (
            <label className="ag-field">
              <span>Skills</span>
              <input
                className="nt-input"
                value={form.skills}
                placeholder="browser, writing"
                data-ag-new-skills=""
                onChange={(e) => set("skills", e.target.value)}
              />
            </label>
          ) : null}
          <label className="ag-field">
            <span>Context</span>
            <textarea
              className="nt-input ag-area"
              rows={2}
              value={form.context}
              maxLength={8000}
              placeholder="Optional. The agent cannot ask you."
              onChange={(e) => set("context", e.target.value)}
            />
          </label>
          <div className="ag-field" role="group" aria-label="Risks">
            <span>Needs your approval for</span>
            <span className="ag-field-chips">
              {NEW_TASK_RISKS.map(([id, label]) => (
                <AgBtn
                  key={id}
                  pressed={form.risks.includes(id)}
                  onClick={() =>
                    set(
                      "risks",
                      form.risks.includes(id)
                        ? form.risks.filter((r) => r !== id)
                        : [...form.risks, id]
                    )
                  }
                >
                  {label}
                </AgBtn>
              ))}
            </span>
          </div>
        </div>
        <div className="ag-sheet-foot">
          <span className="ag-sheet-note" role="alert">
            {touched && problem ? problem : ""}
          </span>
          <AgBtn tone="text" onClick={onClose}>
            Cancel
          </AgBtn>
          <button
            type="submit"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            disabled={busy}
            data-ag-new-submit=""
          >
            Create task
          </button>
        </div>
      </form>
    </Sheet>
  );
}
