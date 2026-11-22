/**
 * @jest-environment jsdom
 *
 * The metro map: one row per milestone in board order, the four states on
 * the rows and the marks, the track between stations, a station opens its
 * task, and the Agents face shows who works on a milestone.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { type RoadmapTask, buildRoadmap } from "@/lib/needt3/roadmap";

import { RoadmapMap, RoadmapSummary } from "../RoadmapMap";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let n = 0;
const task = (over: Partial<RoadmapTask> & { id: string }): RoadmapTask => {
  n += 1;
  return {
    title: over.id,
    done: false,
    status: "todo",
    projectId: "p",
    blockedBy: null,
    notes: null,
    createdAt: `2026-11-01T00:00:${String(n).padStart(2, "0")}Z`,
    dueDate: null,
    deadline: null,
    ...over,
  };
};

const TASKS = [
  task({ id: "auth", title: "Auth flow", done: true, status: "completed" }),
  task({
    id: "billing",
    title: "Billing",
    blockedBy: "auth",
    status: "in_progress",
    parts: [{ done: true }, { done: false }, { done: false }],
  }),
  task({
    id: "onb",
    title: "Onboarding",
    blockedBy: "auth",
    dueDate: "2026-11-20",
  }),
  task({
    id: "launch",
    title: "Launch",
    blockedBy: "billing",
    notes: "blocked by: Onboarding",
  }),
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  host.className = "needt-v3";
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("draws one station per milestone with its state, and opens the task on click", () => {
  const onOpen = jest.fn();
  const map = buildRoadmap("p", TASKS);
  act(() =>
    root.render(h(RoadmapMap, { roadmap: map, hue: "#3b82f6", onOpen }))
  );

  const rows = [
    ...host.querySelectorAll<HTMLButtonElement>("[data-rm-station]"),
  ];
  expect(rows.map((r) => [r.dataset.rmStation, r.dataset.rmState])).toEqual([
    ["auth", "done"],
    ["billing", "current"],
    ["onb", "next"],
    ["launch", "blocked"],
  ]);
  expect(rows[1].textContent).toContain("1 of 3 steps");
  expect(rows[2].textContent).toContain("Up next");
  expect(rows[2].textContent).toContain("20 Nov");
  expect(rows[3].textContent).toContain("Waiting on Billing and Onboarding");

  // marks and track: done tick, current pulse, blocked cross, one fork lane
  expect(host.querySelectorAll(".rm-mark.is-done .rm-tick")).toHaveLength(1);
  expect(host.querySelectorAll(".rm-mark.is-current .rm-pulse")).toHaveLength(
    1
  );
  expect(host.querySelectorAll(".rm-mark.is-blocked .rm-cross")).toHaveLength(
    1
  );
  expect(host.querySelectorAll(".rm-edge.is-line")).toHaveLength(3);
  expect(host.querySelectorAll(".rm-edge.is-wait")).toHaveLength(1);
  expect(host.querySelectorAll(".rm-edge.is-travelled")).toHaveLength(2);
  const svg = host.querySelector("svg.rm-track")!;
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(Number(svg.getAttribute("height"))).toBe(4 * 56);

  act(() => rows[3].click());
  expect(onOpen).toHaveBeenCalledWith("launch");
});

it("names now and next in the summary", () => {
  const map = buildRoadmap("p", TASKS);
  act(() => root.render(h(RoadmapSummary, { roadmap: map })));
  expect(host.textContent).toBe("Now BillingNext Onboarding");
});

it("says so when every milestone is done", () => {
  const map = buildRoadmap("p", [
    task({ id: "a", done: true, status: "completed" }),
  ]);
  act(() => root.render(h(RoadmapSummary, { roadmap: map })));
  expect(host.textContent).toBe("Every milestone is done");
});

it("shows the agent on a milestone's hub item only on the Agents face", () => {
  const map = buildRoadmap("p", TASKS, [
    {
      id: "h1",
      title: "Wire Stripe",
      status: "in_progress",
      taskId: "billing",
      agent: "Claude",
    },
  ]);
  act(() =>
    root.render(h(RoadmapMap, { roadmap: map, hue: "red", onOpen: () => {} }))
  );
  expect(host.querySelector("[data-rm-agent]")).toBeNull();
  act(() =>
    root.render(
      h(RoadmapMap, {
        roadmap: map,
        hue: "red",
        onOpen: () => {},
        agents: true,
      })
    )
  );
  const agent = host.querySelector<HTMLElement>("[data-rm-agent='h1']")!;
  expect(agent.textContent).toBe("Claude · working");
  expect(agent.className).toContain("is-in_progress");
});
