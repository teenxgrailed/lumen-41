import type { V3Project, V3Task } from "@/lib/needt3/map";

import type { HubItemRow } from "../TasksTab";
import { hubForRoadmap, roadmapProjects } from "../roadmap-data";

const project = (id: string, archived = false) =>
  ({ id, name: id, color: null, archived }) as unknown as V3Project;
const task = (id: string, projectId: string | null) =>
  ({
    id,
    title: id,
    projectId,
    done: false,
    status: "todo",
  }) as unknown as V3Task;
const item = (over: Partial<HubItemRow>) =>
  ({
    id: "i",
    title: "item",
    status: "open",
    assignee: "any",
    heldBy: null,
    updatedAt: "2026-11-01T00:00:00Z",
    ...over,
  }) as HubItemRow;

describe("hubForRoadmap", () => {
  it("names the holder first, then the assignee, else nobody", () => {
    const rows = hubForRoadmap([
      item({
        id: "a",
        heldBy: { name: "Codex" },
        assignee: { id: "x", name: "Claude" },
        taskId: "t",
      }),
      item({ id: "b", assignee: { id: "x", name: "Claude" } }),
      item({ id: "c" }),
    ]);
    expect(rows.map((r) => [r.id, r.agent, r.taskId])).toEqual([
      ["a", "Codex", "t"],
      ["b", "Claude", null],
      ["c", null, null],
    ]);
  });
});

describe("roadmapProjects", () => {
  it("puts projects with agents' work first, newest first, and drops empty and archived ones", () => {
    const projects = [
      project("p1"),
      project("p2"),
      project("p3"),
      project("p4"),
      project("p5", true),
    ];
    const tasks = [
      task("t1", "p1"),
      task("t2", "p2"),
      task("t3", "p3"),
      task("t5", "p5"),
    ];
    const items = [
      item({ id: "a", taskId: "t3", updatedAt: "2026-11-02T00:00:00Z" }),
      item({ id: "b", projectId: "p2", updatedAt: "2026-11-05T00:00:00Z" }),
    ];
    expect(roadmapProjects(projects, tasks, items).map((p) => p.id)).toEqual([
      "p2",
      "p3",
      "p1",
    ]);
  });
});
