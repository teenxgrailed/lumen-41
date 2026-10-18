/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import type { Stats } from "@/services/stats/home-stats";
import { type Root, createRoot } from "react-dom/client";

import { ReviewBody, ReviewCard } from "../ReviewSheet";
import { isReviewDay, reviewMarkdown, reviewTitle, winsLines } from "../review";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../phone/kit", () => ({
  PkButton: ({ children, ...p }: { children: string }) =>
    h("button", p, children),
  PkSheet: () => null,
}));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => null,
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

  const props = () => ({
    wins: ["12 tasks done"],
    leftovers: [{ id: "l1", title: "Pay rent", meta: "Overdue" }],
    choices: {},
    date: "2026-10-21",
    minDate: "2026-10-19",
    focuses: ["", "", ""],
    busy: false,
    onChoice: jest.fn(),
    onDate: jest.fn(),
    onFocus: jest.fn(),
    onSubmit: jest.fn(),
    onClose: jest.fn(),
  });

  it("shows wins, leftovers and three focus fields, and saves", async () => {
    const p = props();
    await act(async () => root.render(h(ReviewBody, p)));
    expect(host.querySelector("[data-rv-wins]")?.textContent).toContain(
      "12 tasks done"
    );
    expect(host.querySelectorAll("[data-rv-left-row]")).toHaveLength(1);
    expect(host.querySelectorAll(".rv-focus")).toHaveLength(3);
    (host.querySelector('[data-rv-to="inbox"]') as HTMLElement).click();
    expect(p.onChoice).toHaveBeenCalledWith("l1", "inbox");
    (host.querySelector('[data-fin="review-save"]') as HTMLElement).click();
    expect(p.onSubmit).toHaveBeenCalled();
  });

  it("hides the leftovers section when nothing is left", async () => {
    await act(async () =>
      root.render(h(ReviewBody, { ...props(), leftovers: [] }))
    );
    expect(host.querySelector("[data-rv-left]")).toBeNull();
  });
});
