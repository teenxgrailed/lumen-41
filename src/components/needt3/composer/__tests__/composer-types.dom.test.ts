/**
 * @jest-environment jsdom
 *
 * The desktop create composer is three different forms: Task, Event and Doc
 * each own their placeholder, their footer fields and their button, the typed
 * words survive a tab switch, and Enter makes the current type through its own
 * hook. "tomorrow 3pm" is a day and a clock in a task or an event and plain
 * words in a doc title.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { Composer } from "../Composer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));

const undo = jest.fn();
const createTask = jest.fn();
const createDoc = jest.fn();
const createEvent = jest.fn();
const createHabit = jest.fn();
const addPart = jest.fn();
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  useCreateTask: () => ({ mutateAsync: createTask }),
  useTaskParts: () => ({ add: addPart }),
}));
const createReminder = jest.fn();
jest.mock("@/lib/needt3/hooks/reminders", () => ({
  ...jest.requireActual("@/lib/needt3/hooks/reminders"),
  useReminderActions: () => ({ create: createReminder }),
}));
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useCreateDoc: () => ({ mutateAsync: createDoc }),
  useUpdateDoc: () => ({ mutateAsync: jest.fn() }),
  useTemplates: () => ({ data: [] }),
}));
jest.mock("@/lib/needt3/hooks/places", () => ({
  useCreateFromBuiltin: () => ({ mutateAsync: jest.fn() }),
  useCreateFromTemplate: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/events", () => ({
  useCreateEvent: () => createEvent,
  useCalendars: () => ({
    data: [
      { id: "cal-a", type: "LOCAL", name: "Needt", enabled: true },
      { id: "cal-b", type: "LOCAL", name: "Side", enabled: true },
      { id: "cal-g", type: "GOOGLE", name: "Work Google", enabled: true },
    ],
  }),
}));
jest.mock("@/lib/needt3/hooks/habits", () => ({
  useCreateHabit: () => ({ mutateAsync: createHabit }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({
    data: [
      {
        id: "p1",
        name: "Launch",
        color: null,
        icon: null,
        position: 0,
      },
    ],
  }),
}));

let host: HTMLDivElement;
let root: Root;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(Composer, { open: true, onClose: jest.fn() })));
}

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const field = () => q<HTMLInputElement>(".co-input")!;
const tab = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (b) => b.textContent === name
  )!;
const footLabels = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>(".cmp-foot .cmp-btn")
  ).map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
const goButton = () => q<HTMLButtonElement>(".cmp-go")!;

function type(value: string) {
  const el = field();
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const press = (el: Element, init: KeyboardEventInit) =>
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
    );
  });
const enter = () => press(field(), { key: "Enter" });

beforeEach(() => {
  jest.clearAllMocks();
  createTask.mockResolvedValue({ result: { id: "t1" }, undo });
  createDoc.mockResolvedValue({ result: { id: "d1" }, undo });
  createEvent.mockResolvedValue({ undo });
  createHabit.mockResolvedValue({ result: { id: "h1" }, undo });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Composer: each type is its own form", () => {
  it("Task: New task, Date / Duration / Project / Priority and the more button", () => {
    mount();
    expect(field().placeholder).toBe("New task");
    expect(footLabels()).toEqual([
      "Date",
      "Duration",
      "Project",
      "Priority",
      "More",
      "Open as a full task",
    ]);
    expect(goButton().textContent).toContain("Add task");
  });

  it("Event: New event, date, time, length and calendar, no priority, a location field", () => {
    mount();
    act(() => tab("Event").click());
    expect(field().placeholder).toBe("New event");
    expect(field().getAttribute("aria-label")).toBe("Event name");
    const foot = footLabels();
    expect(foot).toEqual(["Date", "Time", "Duration", "Needt"]);
    expect(foot).not.toContain("Priority");
    expect(foot).not.toContain("Project");
    expect(q('input[aria-label="Location"]')).not.toBeNull();
    expect(goButton().textContent).toContain("Add event");
  });

  it("Event: the calendar picker lists the writable calendars only", () => {
    mount();
    act(() => tab("Event").click());
    const cal = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cmp-foot .cmp-btn")
    ).find((b) => b.textContent === "Needt")!;
    act(() => cal.click());
    const rows = Array.from(document.querySelectorAll('[role="menuitem"]')).map(
      (r) => r.textContent
    );
    expect(rows).toEqual(expect.arrayContaining(["Needt", "Side"]));
    expect(rows.join()).not.toContain("Work Google");
  });

  it("Doc: Untitled doc, folder and template, Create doc, nothing task-shaped", () => {
    mount();
    act(() => tab("Doc").click());
    expect(field().placeholder).toBe("Untitled doc");
    expect(field().getAttribute("aria-label")).toBe("Doc title");
    const foot = footLabels();
    expect(foot).toEqual(["Project", "Template"]);
    for (const gone of ["Date", "Duration", "Priority", "More"])
      expect(foot).not.toContain(gone);
    expect(q('input[aria-label="Location"]')).toBeNull();
    expect(goButton().textContent).toContain("Create doc");
  });
});

describe("Composer: switching and keys", () => {
  it("keeps the typed title across a tab switch", () => {
    mount();
    type("Quarterly review");
    act(() => tab("Doc").click());
    expect(field().value).toBe("Quarterly review");
    act(() => tab("Event").click());
    expect(field().value).toBe("Quarterly review");
    act(() => tab("Task").click());
    expect(field().value).toBe("Quarterly review");
  });

  it("⌘1 / ⌘2 / ⌘3 pick Task / Event / Doc", () => {
    mount();
    const sheet = q(".cmp-sheet")!;
    press(field(), { key: "2", metaKey: true });
    expect(tab("Event").getAttribute("aria-selected")).toBe("true");
    press(field(), { key: "3", ctrlKey: true });
    expect(tab("Doc").getAttribute("aria-selected")).toBe("true");
    press(field(), { key: "1", metaKey: true });
    expect(tab("Task").getAttribute("aria-selected")).toBe("true");
    expect(sheet).not.toBeNull();
  });

  it("the arrow keys move between the tabs and the tabs are in the tab order", () => {
    mount();
    expect(tab("Task").tabIndex).toBe(0);
    expect(tab("Doc").tabIndex).toBe(-1);
    press(tab("Task"), { key: "ArrowRight" });
    expect(tab("Event").getAttribute("aria-selected")).toBe("true");
    expect(tab("Event").tabIndex).toBe(0);
    press(tab("Event"), { key: "ArrowLeft" });
    expect(tab("Task").getAttribute("aria-selected")).toBe("true");
  });
});

describe("Composer: Enter makes the current type", () => {
  it("Task: createTask with the day and clock read from the line", async () => {
    mount();
    type("call mum tomorrow 3pm");
    act(() => tab("Task").click());
    await act(async () => enter());
    expect(createTask).toHaveBeenCalledTimes(1);
    const { draft } = createTask.mock.calls[0][0];
    expect(draft.title).toBe("call mum");
    expect(draft.scheduledStart).toMatch(/T15:00$/);
    expect(createDoc).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("Event: createEvent with start and end, the place and the calendar", async () => {
    mount();
    act(() => tab("Event").click());
    type("standup tomorrow 3pm for 30 min");
    const place = q<HTMLInputElement>('input[aria-label="Location"]')!;
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      set.call(place, "Room 4");
      place.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => enter());
    expect(createEvent).toHaveBeenCalledTimes(1);
    const ev = createEvent.mock.calls[0][0];
    expect(ev.title).toBe("standup");
    expect(ev.startAt).toMatch(/T15:00$/);
    expect(ev.endAt).toMatch(/T15:30$/);
    expect(ev.location).toBe("Room 4");
    expect(ev.calendarId).toBe("cal-a");
    expect(createTask).not.toHaveBeenCalled();
    expect(createDoc).not.toHaveBeenCalled();
  });

  it("Doc: createDoc with the whole title, then opens the new doc", async () => {
    mount();
    act(() => tab("Doc").click());
    type("Plan for tomorrow 3pm / week 2");
    await act(async () => enter());
    expect(createDoc).toHaveBeenCalledTimes(1);
    expect(createDoc.mock.calls[0][0].draft).toEqual({
      title: "Plan for tomorrow 3pm / week 2",
      projectId: null,
    });
    expect(createTask).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/pages/d1");
  });

  it("Doc: a doc title shows no day or clock chip and no underline", () => {
    mount();
    act(() => tab("Doc").click());
    type("Standup notes tomorrow 3pm");
    expect(document.querySelector(".cmp-chips")).toBeNull();
    expect(document.querySelector(".shell-underlay-span")).toBeNull();
  });

  it("Doc: an empty title still makes an untitled doc", async () => {
    mount();
    act(() => tab("Doc").click());
    expect(goButton().disabled).toBe(false);
    await act(async () => enter());
    expect(createDoc).toHaveBeenCalledTimes(1);
    expect(createDoc.mock.calls[0][0].draft.title).toBeUndefined();
  });
});
