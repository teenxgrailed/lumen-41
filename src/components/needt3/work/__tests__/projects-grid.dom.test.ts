/**
 * @jest-environment jsdom
 *
 * The Projects grid: with `folders_v1` off it is the old cards, unchanged;
 * on, every project is a folder whose sheets are its next open tasks and
 * whose count is its open tasks.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Project, V3Task } from "@/lib/needt3/map";

import { ProjectsGrid } from "../ProjectFolders";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../task/Task", () => ({
  Task: () => null,
}));

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

const project = (id: string, name: string): V3Project => ({
  id,
  name,
  color: "#2e6de9",
  icon: null,
  ground: null,
  position: 0,
  archived: false,
});
const task = (id: string, projectId: string, dueDate: string | null) =>
  ({
    id,
    title: `Task ${id}`,
    projectId,
    dueDate,
    done: false,
    noSlot: false,
    scheduledStart: null,
    repeat: null,
  }) as unknown as V3Task;

const projects = [project("p1", "Operations"), project("p2", "Empty one")];
const tasks = [
  task("a", "p1", "2026-11-20"),
  task("b", "p1", "2026-11-16"),
  task("c", "p1", null),
  task("d", "p1", "2026-11-18"),
];
const render = (folders: boolean) =>
  act(() =>
    root.render(
      h(ProjectsGrid, {
        folders,
        projects,
        tasks,
        today: "2026-11-15",
        onOpenTask: jest.fn(),
        onPick: jest.fn(),
      })
    )
  );

describe("ProjectsGrid", () => {
  it("is the old card grid with the flag off", () => {
    render(false);
    expect(host.querySelectorAll("[data-wk-pcard]")).toHaveLength(2);
    expect(host.querySelector(".nx-folder")).toBeNull();
    expect(host.querySelector(".wk-pgrid.is-folders")).toBeNull();
  });

  it("is folders with the flag on: next tasks, open count, link", () => {
    render(true);
    expect(host.querySelector("[data-wk-pcard]")).toBeNull();
    const folders = host.querySelectorAll("a.nx-folder");
    expect(folders).toHaveLength(2);
    const first = folders[0];
    expect(first.getAttribute("href")).toBe("/projects/p1");
    expect(first.getAttribute("aria-label")).toBe("Open Operations");
    expect(first.querySelector("[data-folder-count]")?.textContent).toBe("4");
    // three sheets, the soonest in front
    expect(first.querySelectorAll("[data-folder-peek]")).toHaveLength(3);
    expect(first.querySelector(".nx-folder-peek-title")?.textContent).toBe(
      "Task b"
    );
    // a project with no tasks is an empty folder with a zero
    const empty = folders[1];
    expect(empty.querySelectorAll("[data-folder-peek]")).toHaveLength(0);
    expect(empty.querySelector("[data-folder-count]")?.textContent).toBe("0");
  });
});
