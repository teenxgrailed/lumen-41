/**
 * @jest-environment jsdom
 *
 * The task view form: every option is a control, each control reports the
 * change it stands for, and which rows exist depends on the list the gear
 * sits on (Group only on Tasks; Sort and Overdue not on the Calendar).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import {
  DEFAULT_TASK_VIEW,
  type TaskViewSettings,
} from "@/lib/needt3/task-view";

import { TaskViewForm, type TaskViewScope } from "../TaskViewGear";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(scope: TaskViewScope, view: Partial<TaskViewSettings> = {}) {
  const changes: Partial<TaskViewSettings>[] = [];
  act(() => {
    root.render(
      h(TaskViewForm, {
        scope,
        view: { ...DEFAULT_TASK_VIEW, ...view },
        onChange: (p: Partial<TaskViewSettings>) => changes.push(p),
      })
    );
  });
  return changes;
}
const rows = () =>
  Array.from(host.querySelectorAll("[data-tv-row]")).map(
    (r) => (r as HTMLElement).dataset.tvRow
  );
const seg = (label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;

describe("TaskViewForm", () => {
  it("Tasks has every option", () => {
    mount("tasks");
    expect(rows()).toEqual([
      "Completed",
      "Subtasks",
      "Duration",
      "Project",
      "Sort by",
      "Group by",
      "Overdue first",
    ]);
  });

  it("Home has no Group; the Calendar has neither Group, Sort nor Overdue", () => {
    mount("home");
    expect(rows()).not.toContain("Group by");
    expect(rows()).toContain("Sort by");
    mount("calendar");
    expect(rows()).toEqual(["Completed", "Subtasks", "Duration", "Project"]);
  });

  it("says what the chosen Completed option does", () => {
    mount("tasks", { completed: "hide" });
    expect(host.textContent).toContain("leaves the lists at once");
    mount("tasks", { completed: "today" });
    expect(host.textContent).toContain("until the end of the day");
  });

  it("reports each segmented choice", () => {
    const changes = mount("tasks");
    act(() => seg("Hide").click());
    act(() => seg("Today").click());
    act(() => seg("Priority").click());
    act(() => seg("Project").click());
    expect(changes).toEqual([
      { completed: "hide" },
      { completed: "today" },
      { sort: "priority" },
      { group: "project" },
    ]);
  });

  it("reports each switch", () => {
    const changes = mount("tasks");
    const sw = (label: string) =>
      host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
    act(() => sw("Subtasks").click());
    act(() => sw("Duration").click());
    act(() => sw("Project").click());
    act(() => sw("Overdue first").click());
    expect(changes).toEqual([
      { subtasks: false },
      { duration: false },
      { project: false },
      { overdueFirst: false },
    ]);
  });
});
