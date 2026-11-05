/**
 * @jest-environment jsdom
 *
 * Habit presence through the real notice pipeline: `notify` → the island's
 * sink → the island's own rows (IslandRow, as the corner draws them). The
 * reminder carries one act, Done, which the row shows; with no island
 * mounted (the phone) nothing is said and nothing is spent; nothing is judged
 * before the data has landed; Quit milestones only on Pro, and not as news on
 * the first run; a blocked store does not repeat it every minute; the tick
 * stops on unmount; the push with the same tag is closed.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { IslandRow, IslandSink } from "@/components/needt3/corner/IslandRow";
import {
  NeedtNoticeProvider,
  useNoticeStack,
  useNotify,
} from "@/components/needt/corner/notices";

import type { QuitGate } from "@/lib/needt3/habits-quit";

import { HabitPresenceHost } from "../HabitPresenceHost";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mockGate: QuitGate = "on";
let mockFocus: unknown = null;
let mockAskOpen = false;
let mockHabits: unknown[] = [];
let mockCheckinsReady = true;
let mockSummary: unknown = undefined;
const mockToggle = jest.fn();

const ok = (data: unknown) => ({ data, isSuccess: true });
const alerts = {
  habitReminders: true,
  habitCheckin: true,
  habitCheckinTime: "21:00",
  habitMilestones: true,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  reminders: true,
  channelInApp: true,
  digest: false,
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueries: ({ queries }: { queries: unknown[] }) =>
    queries.map(() =>
      mockSummary
        ? { data: mockSummary, isSuccess: true }
        : { data: undefined, isSuccess: false }
    ),
}));
jest.mock("@/components/needt3/corner/AskProvider", () => ({
  useAskPhase: () => "idle",
}));
jest.mock("@/lib/needt3/hooks/account", () => ({
  useAlerts: () => ok(alerts),
}));
jest.mock("@/lib/needt3/hooks/focus", () => ({
  useFocusSession: () => ({ data: mockFocus }),
}));
jest.mock("@/lib/needt3/hooks/habits", () => ({
  useHabits: () => ok(mockHabits),
  useCheckins: () =>
    mockCheckinsReady ? ok([]) : { data: undefined, isSuccess: false },
  useToggleHabitToday: () => ({ mutate: mockToggle }),
}));
jest.mock("@/lib/needt3/hooks/habits-quit", () => ({
  useQuitGate: () => mockGate,
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
  useSettings: () => ok({ timeZone: "UTC" }),
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
  daysOfWeek: [],
  schedule: { time: "18:00", perWeek: null },
};
const smoking = {
  id: "q",
  title: "Smoking",
  kind: "QUIT",
  archivedAt: null,
  remindersEnabled: true,
  daysOfWeek: [],
  quitStartedAt: "2026-10-21T09:00:00Z",
  schedule: { time: null, perWeek: null },
};
const smokingSummary = {
  started: true,
  streakStartedAt: "2026-10-21T09:00:00Z",
  currentStreak: 14,
  lastMilestone: 14,
  bestStreak: 31,
  totalCleanDays: 74,
  nextMilestone: { days: 30, daysLeft: 16 },
  counts: { URGE: 0, RESISTED: 0, RELAPSE: 0, MILESTONE: 0 },
};

/** The island's rows, drawn as the corner draws them. */
function Rows() {
  const { notices } = useNoticeStack();
  const { dismiss } = useNotify();
  return h(
    "div",
    { "data-island": "" },
    notices.map((n) =>
      h(IslandRow, {
        key: n.id,
        notice: n,
        onAct: (_n, a) => a.run?.(),
        onClose: dismiss,
      })
    )
  );
}

let host: HTMLDivElement;
let root: Root;
const mount = (withIsland = true) =>
  act(() =>
    root.render(
      h(
        NeedtNoticeProvider,
        null,
        withIsland ? h(IslandSink) : null,
        withIsland ? h(Rows) : null,
        h(HabitPresenceHost)
      )
    )
  );
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-island-row]"));
/** Every island row ever drawn (rows leave on their own clock). */
const drawn = new Set<string>();
const collect = () =>
  rows().forEach((r) => drawn.add(r.getAttribute("data-island-row") ?? ""));
const minute = () => {
  act(() => {
    jest.advanceTimersByTime(60_000);
  });
  collect();
};
const closed = jest.fn();

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-11-04T18:05:00Z") });
  localStorage.clear();
  localStorage.setItem(
    "needt.habit-presence.v1",
    JSON.stringify({ seen: [], lastShownAt: null, seeded: true })
  );
  mockGate = "on";
  mockFocus = null;
  mockAskOpen = false;
  mockCheckinsReady = true;
  mockSummary = undefined;
  mockHabits = [german];
  mockToggle.mockReset();
  closed.mockReset();
  drawn.clear();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => ({
        getNotifications: async ({ tag }: { tag: string }) => [
          { close: () => closed(tag) },
        ],
      }),
    },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("shows the reminder on the island with one act, Done, which marks it", async () => {
  mount();
  expect(rows()).toHaveLength(1);
  expect(rows()[0].textContent).toContain("German, 18:00");
  const buttons = Array.from(rows()[0].querySelectorAll("button")).map(
    (b) => b.textContent || b.getAttribute("aria-label")
  );
  expect(buttons).toEqual(["Done", "Dismiss"]);
  await act(async () => {
    await Promise.resolve();
  });
  // The push that said the same thing is closed.
  expect(closed).toHaveBeenCalledWith("rem:de:2026-11-04");
  act(() => {
    rows()[0].querySelector("button")?.click();
  });
  expect(mockToggle).toHaveBeenCalledWith({ id: "de", done: true });
});

it("shows it once, not again on the next minutes", () => {
  mount();
  collect();
  for (let n = 0; n < 30; n++) minute();
  expect(drawn.size).toBe(1);
});

it("says and spends nothing with no island mounted (the phone)", () => {
  mount(false);
  minute();
  const kept = JSON.parse(localStorage.getItem("needt.habit-presence.v1")!);
  expect(kept.seen).toEqual([]);
  // The island arrives (the desktop): the moment is still there.
  mount(true);
  minute();
  expect(rows()).toHaveLength(1);
});

it("waits for the data before judging anything", () => {
  mockCheckinsReady = false;
  mount();
  minute();
  expect(rows()).toHaveLength(0);
  mockCheckinsReady = true;
  mount();
  expect(rows()).toHaveLength(1);
});

it.each([
  ["the flag is off", () => (mockGate = "off")],
  ["a focus runs", () => (mockFocus = { id: "f" })],
  ["Ask is open", () => (mockAskOpen = true)],
])("says nothing while %s", (_name, set) => {
  set();
  mount();
  minute();
  expect(rows()).toHaveLength(0);
});

describe("Quit milestones", () => {
  beforeEach(() => {
    jest.setSystemTime(new Date("2026-11-04T09:30:00Z"));
    mockHabits = [smoking];
    mockSummary = smokingSummary;
  });

  it("are named on Pro", () => {
    mount();
    expect(rows()[0]?.textContent).toContain("Two weeks without smoking");
  });

  it("are not said after a downgrade", () => {
    mockGate = "upgrade";
    mount();
    expect(rows()).toHaveLength(0);
  });

  it("wait for the summary", () => {
    mockSummary = undefined;
    mount();
    expect(rows()).toHaveLength(0);
  });

  it("are not news on the first run on a device", () => {
    localStorage.clear();
    mount();
    minute();
    expect(rows()).toHaveLength(0);
  });
});

it("does not repeat every minute when storage is blocked", () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  mount();
  collect();
  for (let n = 0; n < 30; n++) minute();
  expect(drawn.size).toBe(1);
  expect(mockToggle).not.toHaveBeenCalled();
});

it("stops ticking when it unmounts", () => {
  const clear = jest.spyOn(window, "clearInterval");
  mount();
  act(() => root.render(h(NeedtNoticeProvider, null)));
  expect(clear).toHaveBeenCalled();
});

describe("in the desktop app", () => {
  let api: { isPermissionGranted: jest.Mock; sendNotification: jest.Mock };
  beforeEach(() => {
    api = {
      isPermissionGranted: jest.fn(async () => true),
      sendNotification: jest.fn(),
    };
    (window as unknown as Record<string, unknown>).__TAURI__ = {
      notification: api,
    };
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI__;
  });

  it("says it as a system notification, with the push's tag, when the window is not in front", async () => {
    jest.spyOn(document, "hasFocus").mockReturnValue(false);
    mount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.sendNotification).toHaveBeenCalledWith({
      title: "German, 18:00",
      body: "Your slot starts now · 0 of 14",
      url: "/habits",
      tag: "rem:de:2026-11-04",
    });
    // Said once: not on the island too, not again next minute.
    expect(rows()).toHaveLength(0);
    for (let n = 0; n < 5; n++) minute();
    expect(api.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("uses the island while the window is in front", () => {
    jest.spyOn(document, "hasFocus").mockReturnValue(true);
    mount();
    expect(rows()).toHaveLength(1);
    expect(api.sendNotification).not.toHaveBeenCalled();
  });

  it("speaks with no island mounted when the window is not in front", async () => {
    jest.spyOn(document, "hasFocus").mockReturnValue(false);
    mount(false);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.sendNotification).toHaveBeenCalledTimes(1);
  });
});
