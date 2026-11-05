/**
 * @jest-environment jsdom
 *
 * Habit presence in the open app: the corner speaks at a habit's time
 * (Done / Later), not with the flag off, not while busy, and Quit
 * milestones only when the gate is on.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { QuitGate } from "@/lib/needt3/habits-quit";

import { HabitPresenceHost } from "../HabitPresenceHost";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mockGate: QuitGate = "on";
let mockFocus: unknown = null;
let mockAskOpen = false;
let mockHabits: unknown[] = [];
const mockInfo = jest.fn();
const mockToggle = jest.fn();

const alerts = {
  habitReminders: true,
  habitCheckin: true,
  habitCheckinTime: "21:00",
  habitMilestones: true,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueries: ({ queries }: { queries: unknown[] }) =>
    queries.map(() => ({ data: undefined })),
}));
jest.mock("@/components/needt3/corner/AskProvider", () => ({
  useAskPhase: () => "idle",
}));
jest.mock("@/lib/needt3/hooks/account", () => ({
  useAlerts: () => ({ data: alerts }),
}));
jest.mock("@/lib/needt3/hooks/focus", () => ({
  useFocusSession: () => ({ data: mockFocus }),
}));
jest.mock("@/lib/needt3/hooks/habits", () => ({
  useHabits: () => ({ data: mockHabits }),
  useCheckins: () => ({ data: [] }),
  useToggleHabitToday: () => ({ mutate: mockToggle }),
}));
jest.mock("@/lib/needt3/hooks/habits-quit", () => ({
  useQuitGate: () => mockGate,
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({ useTimeZone: () => "UTC" }));
jest.mock("@/lib/notifications", () => ({
  notify: { info: (...a: unknown[]) => mockInfo(...a) },
}));
jest.mock("@/store/needt3-ui", () => ({
  useNeedt3Ui: (sel: (s: { askOpen: boolean }) => unknown) =>
    sel({ askOpen: mockAskOpen }),
}));

const german = {
  id: "de",
  title: "German",
  kind: "BUILD",
  archivedAt: null,
  remindersEnabled: true,
  schedule: { time: "18:00", perWeek: null },
};
const smoking = {
  id: "q",
  title: "Smoking",
  kind: "QUIT",
  archivedAt: null,
  remindersEnabled: true,
  quitStartedAt: "2026-10-21T09:00:00Z",
  schedule: { time: null, perWeek: null },
};

let host: HTMLDivElement;
let root: Root;
const mount = () => act(() => root.render(h(HabitPresenceHost)));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-11-04T18:05:00Z") });
  localStorage.clear();
  mockGate = "on";
  mockFocus = null;
  mockAskOpen = false;
  mockHabits = [german];
  mockInfo.mockReset();
  mockToggle.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

it("speaks at a habit's time, and Done marks it", () => {
  mount();
  expect(mockInfo).toHaveBeenCalledTimes(1);
  const [title, opts] = mockInfo.mock.calls[0];
  expect(title).toBe("German, 18:00");
  expect(opts.surface).toBe("island");
  expect(opts.actions.map((a: { label: string }) => a.label)).toEqual([
    "Done",
    "Later",
  ]);
  opts.actions[0].onClick();
  expect(mockToggle).toHaveBeenCalledWith({ id: "de", done: true });
});

it("shows it once, not again on the next minute", () => {
  mount();
  act(() => {
    jest.advanceTimersByTime(60_000);
  });
  expect(mockInfo).toHaveBeenCalledTimes(1);
});

it.each([
  ["the flag is off", () => (mockGate = "off")],
  ["a focus runs", () => (mockFocus = { id: "f" })],
  ["Ask is open", () => (mockAskOpen = true)],
])("says nothing while %s", (_name, set) => {
  set();
  mount();
  act(() => {
    jest.advanceTimersByTime(60_000);
  });
  expect(mockInfo).not.toHaveBeenCalled();
});

it("names a Quit milestone on Pro, and not after a downgrade", () => {
  mockHabits = [smoking];
  mockGate = "upgrade";
  mount();
  expect(mockInfo).not.toHaveBeenCalled();
  act(() => root.unmount());
  root = createRoot(host);
  mockGate = "on";
  mount();
  expect(mockInfo.mock.calls[0][0]).toBe("Two weeks without smoking");
});
