/**
 * @jest-environment jsdom
 *
 * Habits: Quit on the real Habits route, data hooks mocked
 * (additions-4/habits-quit HANDOFF §1–3, 6, 8). The pull is logged on the
 * press and once; "No, it passed" writes a held pull with the trigger when
 * the flow closes; "Yes, still" hands the assistant the context on Pro and
 * opens the upgrade on Free; "I slipped" asks first and then writes the
 * slip; Free sees the Pro card and no Create; with the flag off nothing of
 * Quit is drawn.
 */
import { StrictMode, act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { ASK_EVENT } from "@/components/needt3/corner/ask-bridge";

import type { QuitGate } from "@/lib/needt3/habits-quit";

import { HabitsRoute } from "../../../phone/habits/HabitsRoute";
import { usePhoneOverlays } from "../../../phone/overlays/store";
import { PhoneUiProvider } from "../../../root/phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const query = (data: unknown) => ({
  data,
  status: "success",
  fetchStatus: "idle",
  isPending: false,
  error: null,
  refetch: jest.fn(),
});

let mockHabits: unknown[] = [];
let mockGate: QuitGate = "on";
let mockPlanKind = "monthly";
const mockLog = jest.fn();
const mockLogAsync = jest.fn();
const mockPatch = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/lib/needt3/hooks/habits", () => ({
  useHabits: () => query(mockHabits),
  useCheckins: () => query([]),
  useCheckinHistory: () => query(undefined),
  useToggleHabitToday: () => ({ mutate: jest.fn() }),
  useToggleHabitDay: () => ({ mutate: jest.fn() }),
  useCreateHabit: () => ({ mutateAsync: mockCreate }),
  useUpdateHabit: () => ({ mutateAsync: jest.fn() }),
  useArchiveHabit: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/habits-quit", () => ({
  useQuitGate: () => mockGate,
  useQuitSummary: () =>
    query({
      started: true,
      streakStartedAt: "2026-10-23T09:10:00Z",
      currentStreak: 12,
      bestStreak: 31,
      totalCleanDays: 74,
      nextMilestone: { days: 14, daysLeft: 2 },
      counts: { URGE: 20, RESISTED: 18, RELAPSE: 2, MILESTONE: 4 },
    }),
  useHabitEvents: () => query([]),
  useLogHabitEvent: () => ({
    mutate: mockLog,
    mutateAsync: mockLogAsync,
    isPending: false,
  }),
  usePatchHabitEvent: () => ({ mutate: mockPatch }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => query({ kind: mockPlanKind }),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => query([]),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
}));
jest.mock("../../../phone/overlays/snack", () => ({ snack: jest.fn() }));
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => false }));
jest.mock("@/lib/notifications", () => ({
  notify: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

const quitHabit = {
  id: "q",
  title: "Smoking",
  projectId: null,
  color: null,
  icon: null,
  at: null,
  quota: null,
  archivedAt: null,
  kind: "QUIT",
  quitStartedAt: "2026-10-23T09:10:00Z",
  reason: "I want to run the 10k in spring without stopping.",
  schedule: { time: null, perWeek: null },
};
const doHabit = {
  id: "d",
  title: "German",
  projectId: null,
  color: null,
  icon: null,
  schedule: { time: "18:00", perWeek: null },
  archivedAt: null,
};

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const render = (ui: "phone" | "desktop") =>
  act(() =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(PhoneUiProvider, { value: ui }, h(HabitsRoute))
      )
    )
  );
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const byText = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.trim().startsWith(text)
  ) ?? null;
const click = (el: Element | null) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const flush = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-11-04T23:40:00Z") });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  client = new QueryClient();
  mockHabits = [quitHabit, doHabit];
  mockGate = "on";
  mockPlanKind = "monthly";
  mockLog.mockReset();
  mockPatch.mockReset();
  mockCreate.mockReset();
  mockLogAsync
    .mockReset()
    .mockImplementation(async ({ type }: { type: string }) => ({
      id: type === "URGE" ? "urge-1" : `${type.toLowerCase()}-1`,
    }));
  usePhoneOverlays.setState({ paywall: false });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("the list", () => {
  it("draws a Quit card with a live count beside the Do habits", () => {
    render("desktop");
    const card = q('[data-hq-quit="q"]');
    expect(card?.textContent).toContain("Smoking");
    // The title is the card's way in; Pulling is its own button beside it.
    expect(card?.getAttribute("role")).toBeNull();
    expect(
      card?.querySelector(".hq-card-open")?.getAttribute("aria-label")
    ).toBe("Smoking — 12 days 14 hours without");
    expect(card?.textContent).toContain("Next: 14 days");
    // The Do habit keeps its own card and count; Quit is not in "n of m kept".
    expect(q('[data-hb-today="d"]')).not.toBeNull();
    expect(q(".hb-today-count")?.textContent).toBe("0 of 1 kept");
  });

  it("shows nothing of Quit while the flag is off", () => {
    mockGate = "off";
    mockHabits = [doHabit];
    render("desktop");
    expect(q("[data-hq-section]")).toBeNull();
    expect(q("[data-hq-lock]")).toBeNull();
  });

  it("shows the Pro card on Free when there is no Quit habit yet", () => {
    mockGate = "upgrade";
    mockPlanKind = "free";
    mockHabits = [doHabit];
    render("phone");
    expect(q("[data-hq-lock]")?.textContent).toContain("Quit a habit");
    click(byText("See Pro"));
    expect(usePhoneOverlays.getState().paywall).toBeTruthy();
  });
});

describe("Pulling", () => {
  it("logs the pull once on the press, the held pull on the tap, and the trigger on both", async () => {
    render("desktop");
    click(q('[data-hq-pull="q"]'));
    await flush();
    expect(mockLogAsync).toHaveBeenCalledTimes(1);
    expect(mockLogAsync).toHaveBeenCalledWith({ habitId: "q", type: "URGE" });
    expect(q('[data-hq-step="breathe"]')).not.toBeNull();
    expect(q('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");

    click(byText("Skip to my reason"));
    expect(q(".hq-quote")?.textContent).toContain("run the 10k");
    click(byText("Next"));
    click(q("[data-hq-passed]"));
    await flush();
    // Written at the tap, so leaving without Done loses nothing.
    expect(mockLogAsync).toHaveBeenLastCalledWith({
      habitId: "q",
      type: "RESISTED",
    });
    expect(q('[data-hq-step="held"]')?.textContent).toContain("19 pulls held");

    click(byText("Stress"));
    click(byText("4"));
    await flush();
    expect(mockPatch).toHaveBeenCalledWith({
      habitId: "q",
      eventId: "urge-1",
      tag: "stress",
      intensity: 4,
    });
    expect(mockPatch).toHaveBeenCalledWith({
      habitId: "q",
      eventId: "resisted-1",
      tag: "stress",
      intensity: 4,
    });

    click(byText("Done"));
    expect(mockLogAsync).toHaveBeenCalledTimes(2);
    expect(mockLog).not.toHaveBeenCalled();
    expect(q("[data-hq-step]")).toBeNull();
  });

  it("keeps the held pull when the page goes away before Done", async () => {
    render("phone");
    click(q('[data-hq-pull="q"]'));
    click(byText("Skip to my reason"));
    click(byText("Next"));
    click(q("[data-hq-passed]"));
    await flush();
    act(() => root.unmount());
    root = createRoot(host);
    expect(mockLogAsync.mock.calls.map((c) => c[0].type)).toEqual([
      "URGE",
      "RESISTED",
    ]);
  });

  it("keeps the step and logs one pull when the window crosses 700 px", async () => {
    render("desktop");
    click(q('[data-hq-pull="q"]'));
    click(byText("Skip to my reason"));
    render("phone");
    await flush();
    expect(q('[data-hq-step="reason"]')).not.toBeNull();
    expect(mockLogAsync).toHaveBeenCalledTimes(1);
  });

  it("logs one pull under a doubled development render", async () => {
    act(() =>
      root.render(
        h(
          StrictMode,
          null,
          h(
            QueryClientProvider,
            { client },
            h(PhoneUiProvider, { value: "desktop" }, h(HabitsRoute))
          )
        )
      )
    );
    click(q('[data-hq-pull="q"]'));
    await flush();
    expect(mockLogAsync).toHaveBeenCalledTimes(1);
  });

  it("moves on to the reason by itself after a minute of breathing", () => {
    render("desktop");
    click(q('[data-hq-pull="q"]'));
    act(() => {
      jest.advanceTimersByTime(60_500);
    });
    expect(q('[data-hq-step="reason"]')).not.toBeNull();
  });

  it("hands the assistant the context on Pro", async () => {
    const asked = jest.fn();
    window.addEventListener(ASK_EVENT, (e) =>
      asked((e as CustomEvent<string>).detail)
    );
    render("desktop");
    click(q('[data-hq-pull="q"]'));
    click(byText("Skip to my reason"));
    click(byText("Next"));
    click(q("[data-hq-still]"));
    await flush();
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked.mock.calls[0][0]).toContain("Smoking is pulling at me.");
    expect(asked.mock.calls[0][0]).toContain("run the 10k");
    expect(mockPatch).toHaveBeenCalledWith({
      habitId: "q",
      eventId: "urge-1",
      note: "talked",
    });
    expect(q("[data-hq-step]")).toBeNull();
  });

  it("marks Yes, still as Pro when the gate is not on and opens the upgrade", () => {
    mockGate = "upgrade";
    mockPlanKind = "free";
    render("phone");
    click(q('[data-hq-pull="q"]'));
    click(byText("Skip to my reason"));
    click(byText("Next"));
    expect(q("[data-hq-still]")?.textContent).toContain("PRO");
    click(q("[data-hq-still]"));
    expect(usePhoneOverlays.getState().paywall).toBeTruthy();
    // Breathing and the reason stay free: the flow is still open.
    expect(q('[data-hq-step="ask"]')).not.toBeNull();
  });

  it("asks before a slip, writes it, and closes once it is saved", async () => {
    render("phone");
    click(q('[data-hq-pull="q"]'));
    click(byText("Skip to my reason"));
    click(byText("Next"));
    click(byText("I slipped"));
    expect(q(".hq-confirm")?.textContent).toContain("Nothing else is lost.");
    expect(q(".hq-confirm")?.getAttribute("role")).toBe("group");
    click(q("[data-hq-slip-confirm]"));
    expect(mockLogAsync).toHaveBeenLastCalledWith({
      habitId: "q",
      type: "RELAPSE",
    });
    await flush();
    await flush();
    expect(q("[data-hq-step]")).toBeNull();
  });

  it("stays open when the slip could not be saved", async () => {
    render("phone");
    click(q('[data-hq-pull="q"]'));
    await flush();
    mockLogAsync.mockRejectedValueOnce(new Error("offline"));
    click(byText("Skip to my reason"));
    click(byText("Next"));
    click(byText("I slipped"));
    click(q("[data-hq-slip-confirm]"));
    await flush();
    await flush();
    expect(q('[data-hq-step="slip"]')).not.toBeNull();
  });

  it("goes back a step on Esc from the slip question, and closes from the others", () => {
    render("desktop");
    click(q('[data-hq-pull="q"]'));
    click(byText("Skip to my reason"));
    click(byText("Next"));
    click(byText("I slipped"));
    const esc = () =>
      act(() => {
        q('[role="dialog"]')?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
      });
    esc();
    expect(q('[data-hq-step="ask"]')).not.toBeNull();
    esc();
    expect(q("[data-hq-step]")).toBeNull();
  });
});

describe("after a downgrade to Free", () => {
  it("keeps the Quit habit readable and writes nothing", async () => {
    mockGate = "upgrade";
    mockPlanKind = "free";
    render("phone");
    expect(q('[data-hq-quit="q"]')).not.toBeNull();
    click(q('[data-hq-pull="q"]'));
    await flush();
    // Breathing and the reason still run; nothing is logged.
    expect(mockLogAsync).not.toHaveBeenCalled();
    click(byText("Skip to my reason"));
    click(byText("Next"));
    click(q("[data-hq-passed]"));
    click(byText("Done"));
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("sends I slipped to Pro instead of writing a slip", () => {
    mockGate = "upgrade";
    mockPlanKind = "free";
    render("phone");
    click(q('[data-hq-quit="q"] .hq-row-open'));
    click(q("[data-hq-slip]"));
    expect(q(".hq-confirm")).toBeNull();
    expect(mockLog).not.toHaveBeenCalled();
    expect(usePhoneOverlays.getState().paywall).toBeTruthy();
  });
});

describe("the Quit habit", () => {
  it("opens the detail with the run, the reason and what stays after a slip", () => {
    render("desktop");
    click(q('[data-hq-quit="q"] .hq-card-open'));
    const detail = q('[data-hq-detail="q"]');
    expect(detail?.textContent).toContain("Best run");
    expect(detail?.textContent).toContain("31 d");
    expect(detail?.textContent).toContain("“I want to run the 10k");
    expect(detail?.textContent).toContain(
      "No pulls logged yet. Pulling is the button for when it hits."
    );
    click(q("[data-hq-slip]"));
    expect(q(".hq-confirm")?.textContent).toContain("31 d, kept");
    expect(q(".hq-confirm")?.textContent).toContain("74 d, kept");
  });
});

describe("a new habit", () => {
  it("offers Do or Quit, and a Quit on Free has no Create", () => {
    mockGate = "upgrade";
    mockPlanKind = "free";
    mockHabits = [doHabit];
    render("desktop");
    click(q("[data-page-add]"));
    click(q("[data-hq-kind-quit]"));
    expect(q(".pl-habit-sheet [data-hq-lock]")).not.toBeNull();
    expect(q(".pl-habit-save")).toBeNull();
  });

  it("has no kind choice while the flag is off", () => {
    mockGate = "off";
    render("desktop");
    click(q("[data-page-add]"));
    expect(q("[data-hq-kind-quit]")).toBeNull();
  });
});
