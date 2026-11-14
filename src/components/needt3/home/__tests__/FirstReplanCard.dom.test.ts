/**
 * @jest-environment jsdom
 *
 * The first-replan card on Today: nothing without a demo, a Replan and Skip
 * pair while the meeting overlaps the task, Keep and Not now on the preview,
 * and Undo with Remove once kept.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { FirstReplanState } from "@/lib/onboarding/first-replan";

import { FirstReplanCard } from "../FirstReplanCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flow = {
  step: { kind: "idle" } as Record<string, unknown>,
  replan: jest.fn(),
  keep: jest.fn(),
  undo: jest.fn(),
  remove: jest.fn(),
  notNow: jest.fn(),
};
let demo: FirstReplanState | null | undefined;

jest.mock("@/lib/needt3/hooks/first-replan", () => ({
  useFirstReplanDemo: () => ({ data: demo }),
  useFirstReplan: () => flow,
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
}));

const conflict: FirstReplanState = {
  conflict: true,
  task: {
    id: "t",
    title: "Demo: write the weekly plan",
    start: "2026-11-18T10:00:00.000Z",
    end: "2026-11-18T11:00:00.000Z",
  },
  meeting: {
    id: "m",
    title: "Demo: sync with Alex",
    start: "2026-11-18T10:15:00.000Z",
    end: "2026-11-18T11:00:00.000Z",
  },
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  flow.step = { kind: "idle" };
  demo = conflict;
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));
const mount = () => act(async () => root.render(h(FirstReplanCard)));
const press = (key: string) =>
  act(async () => {
    host
      .querySelector<HTMLButtonElement>(`[data-fr="${key}"]`)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

it("draws nothing without a demo", async () => {
  demo = null;
  await mount();
  expect(host.querySelector("[data-hd-first-replan]")).toBeNull();
  demo = undefined;
  await mount();
  expect(host.querySelector("[data-hd-first-replan]")).toBeNull();
});

it("says it is a demo and offers Replan or Skip", async () => {
  await mount();
  expect(host.textContent).toContain("Demo, not on any calendar");
  await press("replan");
  expect(flow.replan).toHaveBeenCalledTimes(1);
  await press("skip");
  expect(flow.remove).toHaveBeenCalledTimes(1);
});

it("shows where the task goes and keeps it only on Keep", async () => {
  flow.step = {
    kind: "preview",
    token: "tok",
    to: { start: "2026-11-18T11:00:00.000Z", end: "2026-11-18T12:00:00.000Z" },
  };
  await mount();
  expect(host.textContent).toContain("Move the task to 11:00");
  expect(flow.keep).not.toHaveBeenCalled();
  await press("keep");
  expect(flow.keep).toHaveBeenCalledWith("tok");
  await press("not-now");
  expect(flow.notNow).toHaveBeenCalledTimes(1);
});

it("after Keep offers Undo and removing the demo", async () => {
  flow.step = { kind: "kept", undoToken: "undo-tok" };
  await mount();
  expect(host.textContent).toContain("Replanned");
  await press("undo");
  expect(flow.undo).toHaveBeenCalledWith("undo-tok");
  await press("remove");
  expect(flow.remove).toHaveBeenCalledTimes(1);
});
