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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { ApiError } from "@/lib/needt3/hooks/core";

import { FREE_HABITS } from "../../../habits/derive";
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
// The desktop screens read the flag from V3Root, which pulls in the whole frame.
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => false }));

const mockInfo = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    info: (...a: unknown[]) => mockInfo(...a),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const full = () =>
  Array.from({ length: FREE_HABITS }, (_, i) => habit(`f${i}`, `H${i}`));
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
  client = new QueryClient();
  mockToggle.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockArchive.mockReset();
  mockSnack.mockReset();
  mockInfo.mockReset();
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
    expect(
      q("[data-phb-quota]")?.textContent?.startsWith(
        `2 of ${FREE_HABITS} habits`
      )
    ).toBe(true);
    mockPlanKind = "yearly";
    render("phone");
    expect(q("[data-phb-quota]")).toBeNull();
  });

  it("a new habit at the limit opens the paywall, not the sheet", () => {
    mockHabits = full();
    render("phone");
    expect(
      q("[data-phb-quota]")?.textContent?.startsWith(
        `${FREE_HABITS} of ${FREE_HABITS} habits`
      )
    ).toBe(true);
    click(q("[data-phb-new]"));
    expect(usePhoneOverlays.getState().paywall).toBe(
      `more than ${FREE_HABITS} habits`
    );
    expect(doc("#phb-name")).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("the Upgrade link at the limit opens the paywall", () => {
    mockHabits = full();
    render("phone");
    click(q("[data-phb-upgrade]"));
    expect(usePhoneOverlays.getState().paywall).toBe(
      `more than ${FREE_HABITS} habits`
    );
  });

  it("while the plan is unknown nothing is blocked", () => {
    mockPlanKind = undefined;
    mockHabits = full();
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
    expect(q('[data-v3-screen="habits"]')).not.toBeNull();
    expect(q("[data-phb-new]")).toBeNull();
    render("phone");
    expect(q('[data-v3-screen="habits"]')).toBeNull();
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

describe("both faces share the controller", () => {
  const desktopInput = () => doc<HTMLInputElement>('input[name="habit-name"]');

  it("a draft started on the desktop survives the swap, and Create writes once", async () => {
    mockCreate.mockResolvedValue({
      result: habit("n", "Stretch"),
      undo: jest.fn(),
    });
    render("desktop");
    click(q("[data-page-add]"));
    typeInto(desktopInput()!, "Stretch");
    render("phone");
    expect(doc<HTMLInputElement>("#phb-name")?.value).toBe("Stretch");
    click(doc("[data-phb-create]"));
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    render("desktop");
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(desktopInput()).toBeNull();
  });

  it("a draft started on the phone survives the swap to the desktop sheet", async () => {
    mockCreate.mockResolvedValue({
      result: habit("n", "Stretch"),
      undo: jest.fn(),
    });
    render("phone");
    click(q("[data-phb-new]"));
    typeInto(doc<HTMLInputElement>("#phb-name")!, "Stretch");
    render("desktop");
    expect(desktopInput()?.value).toBe("Stretch");
    click(doc(".pl-habit-save"));
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("a save running on one face cannot be repeated from the other", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockCreate.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render("desktop");
    click(q("[data-page-add]"));
    typeInto(desktopInput()!, "Stretch");
    click(doc(".pl-habit-save"));
    render("phone");
    click(doc("[data-phb-create]"));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ result: habit("n", "Stretch"), undo: jest.fn() });
      await Promise.resolve();
    });
    await flush();
  });

  it("a refused add goes to the notice on the desktop and the paywall on the phone", () => {
    mockHabits = full();
    render("desktop");
    click(q("[data-page-add]"));
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(usePhoneOverlays.getState().paywall).toBe(false);
    render("phone");
    click(q("[data-phb-new]"));
    expect(usePhoneOverlays.getState().paywall).toBe(
      `more than ${FREE_HABITS} habits`
    );
    expect(mockInfo).toHaveBeenCalledTimes(1);
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

  it("the server's 403 UPGRADE_REQUIRED opens the paywall once and keeps the sheet and the text", async () => {
    mockCreate.mockRejectedValue(new ApiError(403, "UPGRADE_REQUIRED"));
    mockPlanKind = undefined; // the client's plan was stale: nothing gated the tap
    render("phone");
    click(q("[data-phb-new]"));
    typeInto(doc<HTMLInputElement>("#phb-name")!, "Stretch");
    click(doc("[data-phb-create]"));
    await flush();
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(usePhoneOverlays.getState().paywall).toBe(
      `more than ${FREE_HABITS} habits`
    );
    expect(mockSnack).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalled();
    expect(doc<HTMLInputElement>("#phb-name")?.value).toBe("Stretch");
  });

  it("the same refusal on the desktop shows the notice once", async () => {
    mockCreate.mockRejectedValue(new ApiError(403, "UPGRADE_REQUIRED"));
    mockPlanKind = undefined;
    render("desktop");
    click(q("[data-page-add]"));
    typeInto(doc<HTMLInputElement>('input[name="habit-name"]')!, "Stretch");
    click(doc(".pl-habit-save"));
    await flush();
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(usePhoneOverlays.getState().paywall).toBe(false);
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
