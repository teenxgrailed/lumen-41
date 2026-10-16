/**
 * @jest-environment jsdom
 *
 * The phone Home and Calendar, mounted for real over a seeded cache: what the
 * plate says, what a tap opens, what a row's check / swipe writes, the sideways
 * swipe that pages a week (a cancel never pages, a second finger is ignored,
 * an unmount lets go), the state layer, and what an event can do.
 */
import { type FunctionComponent, act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { V3Event, V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { CalendarFaces } from "../../calendar/CalendarFaces";
import type { CalendarController } from "../../calendar/useCalendarController";
import { usePhoneOverlays } from "../../overlays/store";
import { HomeFaces } from "../HomeFaces";
import type { HomeController } from "../useHomeController";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const toggle = jest.fn(() =>
  Promise.resolve({ result: null, undo: jest.fn() })
);
const mutateAsync = jest.fn((...args: unknown[]) =>
  Promise.resolve({ result: null, undo: jest.fn(), args })
);
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  ...jest.requireActual("@/lib/needt3/hooks/tasks"),
  useToggleTask: () => ({ toggle, mutateAsync }),
  useUpdateTask: () => ({ mutateAsync }),
  useCreateTask: () => ({ mutateAsync }),
}));

// StScreen's module reaches V3Root, which imports the CSS entry
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => true }));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const NOW = new Date("2026-09-02T14:20:00Z"); // a Wednesday
const TODAY = "2026-09-02";
const task = (id: string, o: Partial<V3Task> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    notes: null,
    done: false,
    status: "todo",
    projectId: null,
    dueDate: TODAY,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: null,
    isFixed: false,
    noSlot: false,
    trashedAt: null,
    parts: [],
    waits: [],
    updatedAt: null,
    ...o,
  }) as unknown as V3Task;
const event = (id: string, o: Partial<V3Event> = {}): V3Event => ({
  id,
  title: `Event ${id}`,
  startAt: `${TODAY}T14:00`,
  endAt: `${TODAY}T15:00`,
  isAllDay: false,
  calendarId: "c1",
  source: "needt",
  externalId: null,
  ...o,
});

const TASKS = [
  task("late", { dueDate: "2026-09-01", title: "Pay the invoice" }),
  task("am", { scheduledStart: `${TODAY}T09:00`, title: "Standup notes" }),
  task("pm", {
    scheduledStart: `${TODAY}T14:30`,
    estimatedMinutes: 30,
    title: "Call Anna",
  }),
  task("inbox", { dueDate: null, title: "Buy stamps" }),
  task("doneNow", { done: true, title: "Water plants" }),
];
const EVENTS = [event("e1", { title: "Planning" })];

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let fetchMock: jest.Mock;

function pointer(
  type: string,
  p: { x?: number; y?: number; id?: number } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: p.x ?? 0,
    clientY: p.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: p.id ?? 1 });
  Object.defineProperty(e, "pointerType", { value: "touch" });
  return e;
}
const fire = (el: Element | Window, type: string, p = {}) =>
  act(() => {
    el.dispatchEvent(pointer(type, p));
  });
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));

const seed = (tasks: V3Task[] | undefined = TASKS) => {
  client.setQueryData(qk.settings(), {
    theme: "light",
    defaultView: "week",
    timeZone: "UTC",
    weekStartDay: "monday",
    timeFormat: "24h",
    prefs: {},
  });
  if (tasks) client.setQueryData(qk.tasks({}), tasks);
  client.setQueryData(qk.projects(), []);
  client.setQueryData(qk.habits(), [
    {
      id: "h1",
      title: "Stretch",
      projectId: null,
      color: null,
      icon: null,
      schedule: { time: null, perWeek: null },
      archivedAt: null,
    },
  ]);
  client.setQueryData(qk.checkins(), []);
  client.setQueryData(
    qk.events({ from: "2026-08-31", to: "2026-10-12" }),
    EVENTS
  );
  client.setQueryData(
    [...qk.events(), "calendars"],
    [{ id: "c1", name: "Work", type: "LOCAL", enabled: true }]
  );
};

// The route components, as the frame draws them: a face switch over a stub
// desktop face, under the frame's phone-ui context.
// The stub desktop faces are stateful the way the real ones are: all their
// state is the route's controller (HomeScreen / CalendarCraft destructure the
// same fields), so what they show is what the controller kept.
const Btn = (id: string, text: string, onClick: () => void) =>
  h("button", { type: "button", "data-d": id, onClick }, text);
const DeskHome = ({ ctl }: { ctl: HomeController }) =>
  h(
    "div",
    { "data-desktop": "" },
    Btn("tab", ctl.tab, () => ctl.setTab(ctl.tab === "day" ? "week" : "day")),
    Btn("late", String(!!ctl.fold.late), ctl.flip("late")),
    Btn("done", String(!!ctl.fold.done), ctl.flip("done")),
    Btn("skip", ctl.skipped.join(), () => ctl.setSkipped((x) => [...x, "x"])),
    Btn("leaving", Object.keys(ctl.leaving).join(), () => {
      ctl.setLeaving({ a: "strike" });
      ctl.timers.current.a = [window.setTimeout(() => ctl.setLeaving({}), 50)];
    })
  );
const DeskCal = ({ ctl }: { ctl: CalendarController }) =>
  h(
    "div",
    { "data-desktop": "" },
    Btn("week", String(ctl.weekFrom), () => ctl.setWeekFrom("2026-09-14")),
    Btn("view", String(ctl.viewLocal), () => ctl.setViewLocal("days")),
    Btn("draft", ctl.draft ? ctl.draft.date : "", () =>
      ctl.setDraft({ date: TODAY, at: 10, key: 1 })
    )
  );
const PhoneHome = () =>
  h(HomeFaces, { desktop: (ctl: HomeController) => h(DeskHome, { ctl }) });
const PhoneCalendar = () =>
  h(CalendarFaces, {
    desktop: (ctl: CalendarController) => h(DeskCal, { ctl }),
  });
const render = (screen: FunctionComponent, ui: "phone" | "desktop") =>
  root.render(
    h(
      QueryClientProvider,
      { client },
      h(PhoneUiProvider, { value: ui }, h(screen))
    )
  );
const mount = (screen: FunctionComponent, ui: "phone" | "desktop" = "phone") =>
  act(() => render(screen, ui));
/** The window crosses 700 px: same tree, another face. */
const swap = (screen: FunctionComponent, ui: "phone" | "desktop") =>
  act(() => render(screen, ui));

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "nextTick",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "performance",
    ],
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"), // reduced motion: rows leave at once
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  // a request that never comes back: a query with no data stays pending
  fetchMock = jest.fn(() => new Promise<never>(() => {}));
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  toggle.mockClear();
  mutateAsync.mockClear();
  usePhoneOverlays.setState({
    taskId: null,
    taskSeed: null,
    event: null,
    newEvent: null,
  });
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  seed();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  delete (globalThis as { fetch?: unknown }).fetch;
  act(() => root.unmount());
  host.remove();
  client.clear();
});

describe("Home", () => {
  it("the overdue task is on the plate; the rest are rows under the plate", () => {
    mount(PhoneHome);
    expect(q("[data-v2p-next]").getAttribute("data-v2p-next")).toBe("late");
    expect(q(".v2p-next-label").textContent).toBe("Overdue");
    expect(q(".v2p-next-why").textContent).toBe("Overdue since 1 Sep");
    const rows = qa("[data-pk-row]").map((r) => r.getAttribute("data-pk-row"));
    expect(rows).toEqual(["am", "pm", "inbox"]);
    expect(q("[data-v2p-count]").getAttribute("data-v2p-count")).toBe("1/3");
    expect(host.textContent).toContain("Wednesday, 2 September · week 36");
  });

  it("the title opens the task sheet; a row opens it too", () => {
    mount(PhoneHome);
    click(q(".v2p-next-title"));
    expect(usePhoneOverlays.getState().taskId).toBe("late");
    click(q('[data-pk-row="pm"] .pk-row-open'));
    expect(usePhoneOverlays.getState().taskId).toBe("pm");
  });

  it("Skip hands the plate on; Done on a row's ring closes it (reduced motion: at once)", async () => {
    mount(PhoneHome);
    click(q("[data-v2p-skip]"));
    expect(q("[data-v2p-next]").getAttribute("data-v2p-next")).toBe("am");
    click(q('[data-pk-row="pm"] .pk-check'));
    await flush();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle.mock.calls[0]).toEqual([
      expect.objectContaining({ id: "pm" }),
    ]);
  });

  it("Move to today moves every overdue task, each on its own", async () => {
    client.setQueryData(qk.tasks({}), [
      ...TASKS,
      task("late2", { dueDate: "2026-08-30" }),
    ]);
    mount(PhoneHome);
    click(q(".pk-sec .pk-btn.is-chip"));
    await flush();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    const ids = mutateAsync.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(ids.sort()).toEqual(["late", "late2"]);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      patch: { dueDate: TODAY },
    });
  });

  it("a swipe cancelled by the browser writes nothing", () => {
    mount(PhoneHome);
    const open = q<HTMLElement>('[data-pk-row="pm"] .pk-row-open');
    fire(open, "pointerdown", { x: 200, y: 10 });
    fire(window, "pointermove", { x: 40, y: 12 });
    fire(window, "pointercancel");
    fire(window, "pointerup", { x: 40, y: 12 });
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
  });

  it("a swipe left sends the task to tomorrow, keeping its hour", async () => {
    mount(PhoneHome);
    const open = q<HTMLElement>('[data-pk-row="pm"] .pk-row-open');
    fire(open, "pointerdown", { x: 300, y: 10 });
    fire(window, "pointermove", { x: 150, y: 12 });
    fire(window, "pointerup", { x: 150, y: 12 });
    await flush();
    expect(mutateAsync).toHaveBeenCalledWith({
      id: "pm",
      patch: expect.objectContaining({
        dueDate: "2026-09-03",
        scheduledStart: "2026-09-03T14:30",
      }),
    });
  });

  it("habits fold, and a tap ticks today through the habits route", async () => {
    mount(PhoneHome);
    expect(qa("[data-v2p-habit]")).toHaveLength(0);
    click(q(".v2p-habits .pk-sec-fold"));
    expect(q(".v2p-habits .pk-sec-count").textContent).toBe("0 of 1");
    click(q("[data-v2p-habit]"));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/h1/completions/today",
      expect.objectContaining({ method: "PUT" })
    );
    expect(q("[data-v2p-habit]").getAttribute("aria-pressed")).toBe("true");
  });

  it("loading and error come in the body, under the screen's own header", () => {
    client.removeQueries({ queryKey: qk.tasks({}) });
    mount(PhoneHome);
    expect(q("[data-p5-state]").getAttribute("data-p5-state")).toBe("loading");
    expect(host.textContent).toContain("Today");
    expect(qa("[data-v2p-next]")).toHaveLength(0);
  });

  it("a failed load says so with Retry, and Retry asks again", async () => {
    client.removeQueries({ queryKey: qk.tasks({}) });
    fetchMock.mockImplementation(() => Promise.reject(new Error("down")));
    mount(PhoneHome);
    await flush();
    expect(q("[data-p5-state]").getAttribute("data-p5-state")).toBe("error");
    const asked = fetchMock.mock.calls.length;
    click(q("[data-st-retry]"));
    await flush();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(asked);
  });

  it("a clear day says so", () => {
    client.setQueryData(qk.tasks({}), []);
    mount(PhoneHome);
    expect(host.textContent).toContain("A clear day.");
  });
});

describe("Calendar", () => {
  const calTasks = [
    task("t1", {
      scheduledStart: `${TODAY}T14:30`,
      estimatedMinutes: 60,
      title: "Write brief",
    }),
    task("t2", { scheduledStart: `${TODAY}T09:00`, estimatedMinutes: 30 }),
    task("loose", { title: "Reply to Sam" }),
  ];
  beforeEach(() => client.setQueryData(qk.tasks({}), calTasks));
  const selected = () =>
    q('[role="tab"][aria-selected="true"]').getAttribute("data-v2p-day");

  it("today: the event on now is the plate, the clash is marked on both, the past folds", () => {
    mount(PhoneCalendar);
    expect(q("[data-v2p-plate]").getAttribute("data-v2p-plate")).toBe("e1");
    expect(q(".v2p-next-label").textContent).toBe("Now");
    expect(q(".v2p-next-when").textContent).toBe("until 15:00");
    expect(host.textContent).toContain("Overlaps · Write brief");
    expect(q("[data-v2p-clash=t1]").textContent).toContain("Planning");
    expect(host.textContent).toContain("1 overlap");
    expect(qa("[data-v2p-earlier]")).toHaveLength(0); // folded
    expect(selected()).toBe(TODAY);
    expect(host.textContent).toContain("Week 36 · 31 Aug – 6 Sep");
    expect(q(".pk-title").textContent).toBe("September");
  });

  it("a task opens the task sheet, an event opens the event sheet", () => {
    mount(PhoneCalendar);
    click(q("[data-v2p-tl=t1]"));
    expect(usePhoneOverlays.getState().taskId).toBe("t1");
    click(q("[data-v2p-plate]"));
    expect(usePhoneOverlays.getState().event).toMatchObject({
      title: "Planning",
      meta: "Wednesday 2 Sep",
      facts: [
        ["Time", "14:00–15:00"],
        ["Length", "1 h"],
        ["Calendar", "Work"],
        ["Overlaps", "Write brief"],
      ],
    });
  });

  it("‹ › page a week; Today comes back", () => {
    mount(PhoneCalendar);
    click(q("[data-p5-step='1']"));
    expect(selected()).toBe("2026-09-09");
    click(q("[data-p5-step='-1']"));
    click(q("[data-p5-step='-1']"));
    expect(selected()).toBe("2026-08-26");
    click(q(".pk-sub .pk-btn"));
    expect(selected()).toBe(TODAY);
  });

  describe("sideways swipe", () => {
    const body = () => q<HTMLElement>(".v2p-swap");
    it("moves a day on a clear swipe, from the last move", () => {
      mount(PhoneCalendar);
      fire(body(), "pointerdown", { x: 300, y: 100 });
      fire(window, "pointermove", { x: 180, y: 104 });
      fire(window, "pointerup", { x: 0, y: 0 }); // the up event's own coordinates are not used
      expect(selected()).toBe("2026-09-03");
    });
    it("a cancel never pages", () => {
      mount(PhoneCalendar);
      fire(body(), "pointerdown", { x: 300, y: 100 });
      fire(window, "pointermove", { x: 100, y: 100 });
      fire(window, "pointercancel");
      fire(window, "pointerup", { x: 100, y: 100 });
      expect(selected()).toBe(TODAY);
    });
    it("a second finger is ignored, and another finger's up does not end it", () => {
      mount(PhoneCalendar);
      fire(body(), "pointerdown", { x: 300, y: 100, id: 1 });
      fire(body(), "pointerdown", { x: 300, y: 100, id: 2 });
      fire(window, "pointermove", { x: 120, y: 100, id: 2 });
      fire(window, "pointerup", { x: 120, y: 100, id: 2 });
      expect(selected()).toBe(TODAY); // finger 2 paged nothing and ended nothing
      fire(window, "pointermove", { x: 150, y: 100, id: 1 });
      fire(window, "pointerup", { x: 150, y: 100, id: 1 });
      expect(selected()).toBe("2026-09-03");
    });
    it("a vertical drag is a scroll, not a swipe", () => {
      mount(PhoneCalendar);
      fire(body(), "pointerdown", { x: 200, y: 100 });
      fire(window, "pointermove", { x: 170, y: 300 });
      fire(window, "pointerup", { x: 170, y: 300 });
      expect(selected()).toBe(TODAY);
    });
    it("the tap that ends a swipe does not open the row under it", () => {
      client.setQueryData(qk.tasks({}), [
        ...calTasks,
        task("next", {
          dueDate: "2026-09-03",
          scheduledStart: "2026-09-03T10:00",
          estimatedMinutes: 30,
        }),
      ]);
      mount(PhoneCalendar);
      fire(q("[data-v2p-tl=t1]"), "pointerdown", { x: 300, y: 100 });
      fire(window, "pointermove", { x: 150, y: 100 });
      fire(window, "pointerup", { x: 150, y: 100 });
      expect(selected()).toBe("2026-09-03");
      // the browser sends a click to what is under the finger now
      click(q("[data-v2p-plate=next]"));
      expect(usePhoneOverlays.getState().taskId).toBeNull();
    });
    it("unmounting in the middle of a swipe lets go of the window", () => {
      mount(PhoneCalendar);
      const add = jest.spyOn(window, "addEventListener");
      const remove = jest.spyOn(window, "removeEventListener");
      fire(body(), "pointerdown", { x: 300, y: 100 });
      const added = add.mock.calls.filter((c) => /^pointer/.test(String(c[0])));
      expect(added.length).toBe(3);
      act(() => root.unmount());
      const removed = remove.mock.calls.filter((c) =>
        /^pointer/.test(String(c[0]))
      );
      expect(removed.length).toBe(3);
      root = createRoot(host);
    });
  });

  it("Month: the grid of the month, a day picked keeps the month; steps and swipe page months", () => {
    mount(PhoneCalendar);
    click(q("[data-v2p-view-btn=month]"));
    expect(qa("[data-v2p-mc]")).toHaveLength(35);
    click(q("[data-v2p-mc='2026-09-10']"));
    expect(qa("[data-v2p-mc]")).toHaveLength(35);
    expect(q("[data-v2p-month-day]").getAttribute("data-v2p-month-day")).toBe(
      "2026-09-10"
    );
    click(q("[data-p5-step='1']"));
    expect(q(".pk-title").textContent).toBe("October");
    expect(q("[data-v2p-month-day]").getAttribute("data-v2p-month-day")).toBe(
      "2026-10-10"
    );
  });

  it("Event opens the new-event sheet on a free half hour of the day", () => {
    mount(PhoneCalendar);
    click(q("[data-p5-new-event]"));
    // 14:20 now: 14:30 touches the event on now and Write brief, so the next free hour
    expect(usePhoneOverlays.getState().newEvent).toEqual({
      startAt: `${TODAY}T15:30`,
      endAt: `${TODAY}T16:30`,
    });
  });

  it("a day with nothing says so", () => {
    client.setQueryData(qk.tasks({}), []);
    client.setQueryData(
      qk.events({ from: "2026-08-31", to: "2026-10-12" }),
      []
    );
    mount(PhoneCalendar);
    expect(host.textContent).toContain("Nothing planned");
    expect(host.textContent).toContain("A free day.");
  });
});

describe("two faces, one state (crossing 700 px)", () => {
  it("Home keeps Skip and the open sections across a swap and back", () => {
    mount(PhoneHome);
    click(q("[data-v2p-skip]"));
    click(q(".v2p-habits .pk-sec-fold"));
    expect(q("[data-v2p-next]").getAttribute("data-v2p-next")).toBe("am");
    swap(PhoneHome, "desktop");
    expect(qa(".pk-screen")).toHaveLength(0);
    expect(qa("[data-desktop]")).toHaveLength(1);
    swap(PhoneHome, "phone");
    expect(q("[data-v2p-next]").getAttribute("data-v2p-next")).toBe("am");
    expect(qa("[data-v2p-habit]")).toHaveLength(1);
  });

  it("a row that is mid-exit still writes, once, when the window is resized", async () => {
    jest.useFakeTimers({ now: NOW });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false, // motion on: the exit plays in steps
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    mount(PhoneHome);
    click(q('[data-pk-row="pm"] .pk-check'));
    expect(toggle).not.toHaveBeenCalled(); // the check is still showing
    swap(PhoneHome, "desktop");
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle.mock.calls[0]).toEqual([
      expect.objectContaining({ id: "pm" }),
    ]);
    swap(PhoneHome, "phone");
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("the desktop's state survives a round trip through the phone (and the phone's the desktop)", () => {
    mount(PhoneHome, "desktop");
    click(q("[data-d=tab]"));
    click(q("[data-d=late]"));
    click(q("[data-d=skip]"));
    click(q("[data-d=done]")); // the fold both faces share: Done today opens
    swap(PhoneHome, "phone");
    expect(qa("[data-desktop]")).toHaveLength(0);
    // Done today is open on the phone too, and Skip passed nothing real over
    expect(qa("[data-pk-row=doneNow]")).toHaveLength(1);
    click(q("[data-v2p-skip]"));
    swap(PhoneHome, "desktop");
    expect(q("[data-d=tab]").textContent).toBe("week");
    expect(q("[data-d=late]").textContent).toBe("true");
    expect(q("[data-d=skip]").textContent).toBe("x,late"); // the phone's Skip is in the same list
    expect(q("[data-d=done]").textContent).toBe("false");
  });

  it("a desktop row's strike ends after the face is gone", () => {
    jest.useFakeTimers({ now: NOW });
    mount(PhoneHome, "desktop");
    click(q("[data-d=leaving]"));
    expect(q("[data-d=leaving]").textContent).toBe("a");
    swap(PhoneHome, "phone"); // the desktop face unmounts mid-strike
    act(() => {
      jest.advanceTimersByTime(100);
    });
    swap(PhoneHome, "desktop");
    expect(q("[data-d=leaving]").textContent).toBe("");
  });

  describe("Calendar", () => {
    beforeEach(() =>
      client.setQueryData(qk.tasks({}), [
        task("loose", { title: "Reply to Sam" }),
        task("t1", { scheduledStart: `${TODAY}T14:30`, estimatedMinutes: 60 }),
      ])
    );
    it("keeps the picked day and the view", () => {
      mount(PhoneCalendar);
      click(q("[data-v2p-day='2026-09-04']"));
      click(q("[data-v2p-view-btn=month]"));
      click(q("[data-v2p-mc='2026-09-10']"));
      swap(PhoneCalendar, "desktop");
      expect(qa(".pk-screen")).toHaveLength(0);
      swap(PhoneCalendar, "phone");
      expect(q("[data-v2p-month-day]").getAttribute("data-v2p-month-day")).toBe(
        "2026-09-10"
      );
      expect(q("[data-v2p-view]").getAttribute("data-v2p-view")).toBe("month");
    });
    it("keeps the desktop's paging, view and slot draft across a round trip", () => {
      mount(PhoneCalendar, "desktop");
      click(q("[data-d=week]"));
      click(q("[data-d=view]"));
      click(q("[data-d=draft]"));
      swap(PhoneCalendar, "phone");
      expect(qa("[data-desktop]")).toHaveLength(0);
      click(q("[data-v2p-day='2026-09-04']")); // the phone's own pick, meanwhile
      swap(PhoneCalendar, "desktop");
      expect(q("[data-d=week]").textContent).toBe("2026-09-14");
      expect(q("[data-d=view]").textContent).toBe("days");
      expect(q("[data-d=draft]").textContent).toBe(TODAY);
      swap(PhoneCalendar, "phone");
      expect(
        q("[role=tab][aria-selected=true]").getAttribute("data-v2p-day")
      ).toBe("2026-09-04");
    });
    it("keeps an open fold", () => {
      mount(PhoneCalendar);
      expect(qa("[data-v2p-tl=loose]")).toHaveLength(0);
      click(q(".v2p-fold .pk-sec-fold"));
      expect(qa("[data-v2p-tl=loose]")).toHaveLength(1);
      swap(PhoneCalendar, "desktop");
      swap(PhoneCalendar, "phone");
      expect(qa("[data-v2p-tl=loose]")).toHaveLength(1);
    });
  });
});
