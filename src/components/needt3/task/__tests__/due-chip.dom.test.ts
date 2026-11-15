/**
 * @jest-environment jsdom
 *
 * A task row shows its due date as a chip: neutral while it is ahead,
 * destructive text once it is overdue, nothing for a done task or one with no
 * due date.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { Task } from "../Task";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => false,
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

const task = {
  id: "a",
  title: "Write the brief",
  done: false,
  status: "todo",
  projectId: null,
  dueDate: "2026-10-20",
  estimatedMinutes: 45,
  scheduledStart: "2026-10-16T14:00",
  scheduledEnd: "2026-10-16T14:45",
  isFixed: false,
  auto: true,
  priority: "medium",
  entry: null,
  parts: [],
  waits: [],
} as unknown as V3Task;

beforeEach(() => {
  (globalThis as { fetch?: unknown }).fetch = () => new Promise(() => {});
  client = new QueryClient();
  client.setQueryData(qk.projects(), []);
  client.setQueryData(qk.settings(), {
    theme: "light",
    defaultView: "week",
    timeZone: "UTC",
    weekStartDay: "monday",
    timeFormat: "24h",
    prefs: {},
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (globalThis as { fetch?: unknown }).fetch;
});

function mount(t: V3Task, props: Record<string, unknown>) {
  act(() => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(Task, { task: t, today: "2026-10-16", ...props })
      )
    );
  });
}

const chip = () =>
  host.querySelector("[data-task-due]") as HTMLElement | null;

describe("due date chip", () => {
  it.each([
    ["row desk", { layout: "row" }],
    ["row touch", { layout: "row", density: "touch" }],
  ])("%s shows the due day", (_name, props) => {
    mount(task, props);
    expect(chip()?.textContent).toBe("20 Oct");
    expect(chip()?.getAttribute("aria-label")).toBe("Due 20 Oct");
    expect(chip()?.classList.contains("is-late")).toBe(false);
  });

  it.each([
    ["row desk", { layout: "row" }],
    ["row touch", { layout: "row", density: "touch" }],
  ])("%s marks an overdue task", (_name, props) => {
    mount({ ...task, dueDate: "2026-10-10" } as V3Task, props);
    expect(chip()?.textContent).toBe("10 Oct");
    expect(chip()?.classList.contains("is-late")).toBe(true);
    expect(chip()?.getAttribute("aria-label")).toBe(
      "Overdue — was due 10 Oct"
    );
  });

  it("draws nothing without a due date or on a done task", () => {
    mount({ ...task, dueDate: null } as V3Task, { layout: "row" });
    expect(chip()).toBeNull();
    mount({ ...task, done: true } as V3Task, { layout: "row" });
    expect(chip()).toBeNull();
  });

  it("does not say the date twice when the row is already late", () => {
    mount({ ...task, dueDate: "2026-10-10" } as V3Task, {
      layout: "row",
      late: true,
    });
    expect(chip()).toBeNull();
    expect(host.textContent).toContain("10 Oct");
  });
});
