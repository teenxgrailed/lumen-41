/**
 * @jest-environment jsdom
 *
 * The Habits route, mounted for real (data hooks mocked): the Free allowance
 * shows and its blocked add opens the paywall instead of the sheet; a tick
 * writes once and a face swap never repeats it; the sheet's draft belongs to
 * the route, so crossing 700 px keeps what was typed; a double tap on Create
 * writes once; a failed save keeps the sheet and the text.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { usePhoneOverlays } from "../../overlays/store";
import { HabitsRoute } from "../HabitsRoute";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockToggle = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockArchive = jest.fn();
const mockSnack = jest.fn();
let mockPlanKind: string | undefined = "free";
let mockHabits: unknown[] = [];

const query = (data: unknown) => ({
  data,
  status: "success",
  fetchStatus: "idle",
  error: null,
  refetch: jest.fn(),
});

jest.mock("@/lib/needt3/hooks/habits", () => ({
  useHabits: () => query(mockHabits),
  useCheckins: () => query([]),
  useToggleHabitToday: () => ({ mutate: mockToggle }),
  useCreateHabit: () => ({ mutateAsync: mockCreate }),
  useUpdateHabit: () => ({ mutateAsync: mockUpdate }),
  useArchiveHabit: () => ({ mutateAsync: mockArchive }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => query(mockPlanKind ? { kind: mockPlanKind } : undefined),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => query([]),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
}));
jest.mock("../../overlays/snack", () => ({
  snack: (...a: unknown[]) => mockSnack(...a),
}));
jest.mock("../../../habits/HabitsScreen", () => {
  const { createElement } = jest.requireActual("react");
  return {
    HabitsScreen: () => createElement("div", { "data-desktop-habits": "" }),
  };
});

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const habit = (id: string, title: string) => ({
  id,
  title,
  projectId: null,
  color: null,
  icon: null,
  schedule: { time: null, perWeek: null },
  archivedAt: null,
});

let host: HTMLDivElement;
let root: Root;

const render = (ui: "phone" | "desktop") =>
  act(() => root.render(h(PhoneUiProvider, { value: ui }, h(HabitsRoute))));
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const flush = () => act(async () => void (await Promise.resolve()));

function typeInto(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  act(() => {
    set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = (el: Element | null) =>
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
/* The sheet renders into the document (not the host): look in both. */
const doc = <T extends Element>(sel: string) => document.querySelector<T>(sel);

beforeEach(() => {
  jest.useFakeTimers();
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
  mockToggle.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockArchive.mockReset();
  mockSnack.mockReset();
  mockPlanKind = "free";
  mockHabits = [habit("a", "Read"), habit("b", "Run")];
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

describe("the Free allowance", () => {
  it("shows the count on Free and nothing on Pro", () => {
    render("phone");
    expect(q("[data-phb-quota]")?.textContent).toMatch(/^2 of 3 habits/);
    mockPlanKind = "yearly";
    render("phone");
    expect(q("[data-phb-quota]")).toBeNull();
  });

  it("a new habit at the limit opens the paywall, not the sheet", () => {
    mockHabits = [habit("a", "A"), habit("b", "B"), habit("c", "C")];
    render("phone");
    expect(q("[data-phb-quota]")?.textContent).toMatch(/^3 of 3 habits/);
    click(q("[data-phb-new]"));
    expect(usePhoneOverlays.getState().paywall).toBe("more than 3 habits");
    expect(doc("#phb-name")).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("the Upgrade link at the limit opens the paywall", () => {
    mockHabits = [habit("a", "A"), habit("b", "B"), habit("c", "C")];
    render("phone");
    click(q("[data-phb-upgrade]"));
    expect(usePhoneOverlays.getState().paywall).toBe("more than 3 habits");
  });

  it("while the plan is unknown nothing is blocked", () => {
    mockPlanKind = undefined;
    mockHabits = [habit("a", "A"), habit("b", "B"), habit("c", "C")];
    render("phone");
    click(q("[data-phb-new]"));
    expect(usePhoneOverlays.getState().paywall).toBe(false);
    expect(doc("#phb-name")).not.toBeNull();
  });
});

describe("one state across the face swap", () => {
  it("a tick writes once, and a swap writes nothing more", () => {
    render("phone");
    click(q('[data-phb-ring="a"]'));
    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle).toHaveBeenCalledWith({ id: "a", done: true });
    render("desktop");
    render("phone");
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("the face is the route's choice and the desktop face is untouched", () => {
    render("desktop");
    expect(q("[data-desktop-habits]")).not.toBeNull();
    expect(q("[data-phb-new]")).toBeNull();
    render("phone");
    expect(q("[data-desktop-habits]")).toBeNull();
    expect(q("[data-phb-new]")).not.toBeNull();
  });

  it("what was typed in the sheet survives crossing 700 px", () => {
    render("phone");
    click(q("[data-phb-new]"));
    typeInto(doc<HTMLInputElement>("#phb-name")!, "Stretch");
    render("desktop");
    expect(doc("#phb-name")).toBeNull();
    render("phone");
    expect(doc<HTMLInputElement>("#phb-name")?.value).toBe("Stretch");
  });
});

describe("saving", () => {
  it("a double tap on Create writes once, then the sheet closes", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockCreate.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render("phone");
    click(q("[data-phb-new]"));
    typeInto(doc<HTMLInputElement>("#phb-name")!, "Stretch");
    const create = doc<HTMLButtonElement>("[data-phb-create]");
    // Enter in the field is not stopped by the button's disabled state
    const enter = () =>
      act(() => {
        doc("#phb-name")?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          })
        );
      });
    click(create);
    enter();
    enter();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(doc(".phb-sheet")?.closest("[inert]")).toBeNull();
    expect(mockCreate).toHaveBeenCalledWith({
      draft: {
        title: "Stretch",
        projectId: null,
        schedule: { time: null, perWeek: null },
      },
    });
    await act(async () => {
      resolve({ result: habit("n", "Stretch"), undo: jest.fn() });
      await Promise.resolve();
    });
    await flush();
    expect(mockSnack).toHaveBeenCalledWith(
      "Habit “Stretch” added",
      expect.any(Function)
    );
    // the sheet is put away (inert) once the write landed
    expect(doc(".phb-sheet")?.closest("[inert]")).not.toBeNull();
  });

  it("a failed save keeps the sheet and the text", async () => {
    mockCreate.mockRejectedValue(new Error("offline"));
    render("phone");
    click(q("[data-phb-new]"));
    typeInto(doc<HTMLInputElement>("#phb-name")!, "Stretch");
    click(doc("[data-phb-create]"));
    await flush();
    await flush();
    expect(mockSnack).not.toHaveBeenCalled();
    expect(doc<HTMLInputElement>("#phb-name")?.value).toBe("Stretch");
    // and a second try is allowed
    click(doc("[data-phb-create]"));
    expect(mockCreate).toHaveBeenCalledTimes(2);
    await flush();
    await flush();
  });

  it("an invalid time shows its error and blocks Create", () => {
    render("phone");
    click(q("[data-phb-new]"));
    typeInto(doc<HTMLInputElement>("#phb-name")!, "Stretch");
    typeInto(doc<HTMLInputElement>("#phb-time")!, "25:00");
    const err = doc("#phb-time-err");
    expect(err?.getAttribute("role")).toBe("alert");
    expect(doc("#phb-time")?.getAttribute("aria-describedby")).toBe(
      "phb-time-err"
    );
    expect(doc<HTMLButtonElement>("[data-phb-create]")?.disabled).toBe(true);
    click(doc("[data-phb-create]"));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
