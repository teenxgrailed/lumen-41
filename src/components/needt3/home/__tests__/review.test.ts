/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import type { Stats } from "@/services/stats/home-stats";
import { type Root, createRoot } from "react-dom/client";

import { ReviewCard } from "../ReviewCard";
import { HaReview } from "../ha/HaReview";
import {
  focusItems,
  focusOptions,
  isReviewDay,
  reviewMarkdown,
  reviewTitle,
  weekRangeLabel,
  winsLines,
} from "../review";
import { TODAY, task } from "./fixtures";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../phone/kit", () => ({
  PkButton: ({ children, ...p }: { children: string }) =>
    h("button", p, children),
}));

const stats = (over: Partial<Stats> = {}): Stats => ({
  range: "week",
  from: "2026-10-13",
  to: "2026-10-19",
  timeZone: "UTC",
  total: 12,
  days: [],
  bestDay: "2026-10-16",
  byProject: [
    { projectId: null, name: "No project", color: null, done: 7 },
    { projectId: "p1", name: "Launch", color: null, done: 5 },
  ],
  byWeekday: [],
  bestWeekday: 5,
  focusMinutes: 260,
  focusSessions: 6,
  ...over,
});

describe("the Sunday review", () => {
  it("is offered on Sundays only", () => {
    expect(isReviewDay("2026-10-18")).toBe(true); // Sunday
    expect(isReviewDay("2026-10-19")).toBe(false);
  });
  it("is titled by the Sunday it is done on", () => {
    expect(reviewTitle("2026-10-18")).toBe("Weekly review · 18 October 2026");
  });
  it("lists the wins from the week's stats", () => {
    expect(winsLines(stats())).toEqual([
      "12 tasks done",
      "Best day: Friday",
      "Most in Launch: 5",
      "4 h 20 of focus",
    ]);
    expect(
      winsLines(
        stats({ total: 1, bestDay: null, byProject: [], focusMinutes: null })
      )
    ).toEqual(["1 task done"]);
  });
  it("has no wins for an empty week or no stats", () => {
    expect(winsLines(stats({ total: 0 }))).toEqual([]);
    expect(winsLines(undefined)).toEqual([]);
  });
  it("writes the note as Markdown", () => {
    expect(
      reviewMarkdown({
        wins: ["12 tasks done"],
        moved: [{ title: "Pay rent", to: "Monday" }],
        focuses: ["Ship v2", "  ", "Hire"],
      })
    ).toBe(
      [
        "## Wins",
        "",
        "- 12 tasks done",
        "",
        "## Moved",
        "",
        "- Pay rent → Monday",
        "",
        "## Focus for next week",
        "",
        "1. Ship v2",
        "2. Hire",
      ].join("\n")
    );
  });
  it("still writes something for a quiet week", () => {
    const md = reviewMarkdown({ wins: [], moved: [], focuses: ["", "", ""] });
    expect(md).toContain("A quiet week.");
    expect(md).toContain("Nothing picked yet.");
    expect(md).not.toContain("## Moved");
  });
});

describe("the review's screens", () => {
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

  it("the card starts the review or puts it off", async () => {
    const onStart = jest.fn();
    const onLater = jest.fn();
    await act(async () => root.render(h(ReviewCard, { onStart, onLater })));
    (host.querySelector('[data-fin="review-start"]') as HTMLElement).click();
    (host.querySelector('[data-rv="later"]') as HTMLElement).click();
    expect(onStart).toHaveBeenCalled();
    expect(onLater).toHaveBeenCalled();
  });

  const options = [
    {
      key: "project:p1",
      kind: "project" as const,
      id: "p1",
      title: "Launch",
      color: "red",
    },
    {
      key: "task:t1",
      kind: "task" as const,
      id: "t1",
      title: "Ship v2",
      color: "red",
    },
    {
      key: "task:t2",
      kind: "task" as const,
      id: "t2",
      title: "Hire",
      color: "red",
    },
    {
      key: "task:t3",
      kind: "task" as const,
      id: "t3",
      title: "Plan",
      color: "red",
    },
  ];
  const props = (over = {}) => ({
    title: "Week 43 in review",
    sub: "Sunday · 12–18 October",
    wins: [{ b: "12", span: "tasks done" }],
    winLines: ["Best day: Friday"],
    leftovers: [{ id: "l1", title: "Pay rent", meta: "Overdue" }],
    moves: {},
    date: "2026-10-21",
    minDate: "2026-10-19",
    options,
    picked: [] as string[],
    nextWeek: 44,
    busy: false,
    onMove: jest.fn(),
    onDate: jest.fn(),
    onPick: jest.fn(),
    onSubmit: jest.fn(),
    onClose: jest.fn(),
    ...over,
  });
  const tap = (sel: string) =>
    (host.querySelector(sel) as HTMLButtonElement).click();

  it("shows wins and leftovers, and picking a focus reports its key", async () => {
    const p = props();
    await act(async () => root.render(h(HaReview, p)));
    expect(host.textContent).toContain("12");
    expect(host.textContent).toContain("Best day: Friday");
    expect(host.querySelectorAll("[data-ha-left]")).toHaveLength(1);
    tap('[data-ha-to="inbox"]');
    expect(p.onMove).toHaveBeenCalledWith("l1", "inbox");
    tap('[data-ha-focus="task:t1"]');
    expect(p.onPick).toHaveBeenCalledWith("task:t1");
  });

  it("saves only with exactly three picked, and a fourth cannot be picked", async () => {
    await act(async () =>
      root.render(h(HaReview, props({ picked: ["project:p1", "task:t1"] })))
    );
    expect(
      (host.querySelector('[data-ha="review-save"]') as HTMLButtonElement)
        .disabled
    ).toBe(true);
    const p = props({ picked: ["project:p1", "task:t1", "task:t2"] });
    await act(async () => root.render(h(HaReview, p)));
    expect(
      (host.querySelector('[data-ha-focus="task:t3"]') as HTMLButtonElement)
        .disabled
    ).toBe(true);
    tap('[data-ha="review-save"]');
    expect(p.onSubmit).toHaveBeenCalled();
    expect(host.textContent).toContain("Start week 44");
  });

  it("asks for as many as there are when fewer than three can be picked", async () => {
    const p = props({ options: options.slice(0, 1), picked: ["project:p1"] });
    await act(async () => root.render(h(HaReview, p)));
    expect(
      (host.querySelector('[data-ha="review-save"]') as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("hides the leftovers section when nothing is left", async () => {
    await act(async () => root.render(h(HaReview, props({ leftovers: [] }))));
    expect(host.querySelector("[data-ha-left]")).toBeNull();
  });
});

describe("the focus picker's options", () => {
  const projects = [
    {
      id: "p1",
      name: "Launch",
      color: "#e5484d",
      icon: null,
      ground: null,
      position: 0,
      archived: false,
    },
    {
      id: "p2",
      name: "Old",
      color: null,
      icon: null,
      ground: null,
      position: 1,
      archived: true,
    },
    {
      id: "p3",
      name: "Quiet",
      color: null,
      icon: null,
      ground: null,
      position: 2,
      archived: false,
    },
  ];
  it("offers projects with open work, then the tasks that press, by id", () => {
    const a = task({
      title: "Due soon",
      projectId: "p1",
      dueDate: "2026-09-03",
      priority: "high",
    });
    const b = task({ title: "Later", projectId: "p1", dueDate: "2026-12-01" });
    const c = task({
      title: "Archived project",
      projectId: "p2",
      dueDate: "2026-09-02",
    });
    const d = task({
      title: "Closed",
      projectId: "p1",
      dueDate: "2026-09-02",
      done: true,
    });
    const opts = focusOptions([a, b, c, d], projects, TODAY);
    expect(opts.map((o) => o.key)).toEqual([
      "project:p1",
      `task:${a.id}`,
      `task:${c.id}`,
    ]);
    expect(opts[0]).toMatchObject({
      kind: "project",
      title: "Launch",
      color: "#e5484d",
    });
  });
  it("turns picked keys into references with the name as a snapshot", () => {
    const opts = [
      {
        key: "project:p1",
        kind: "project" as const,
        id: "p1",
        title: "Launch",
        color: "x",
      },
      {
        key: "task:t9",
        kind: "task" as const,
        id: "t9",
        title: "Ship",
        color: "x",
      },
    ];
    expect(focusItems(opts, ["task:t9", "gone", "project:p1"])).toEqual([
      { title: "Ship", taskId: "t9" },
      { title: "Launch", projectId: "p1" },
    ]);
  });
  it("names the week, across a month end too", () => {
    expect(weekRangeLabel("2026-10-12")).toBe("12–18 Oct");
    expect(weekRangeLabel("2026-10-26")).toBe("26 Oct – 1 Nov");
  });
});
