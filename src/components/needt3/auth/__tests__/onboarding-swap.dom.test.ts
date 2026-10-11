/**
 * @jest-environment jsdom
 *
 * One controller above the face switch: crossing 700px keeps the step, the
 * typed values and the first task (no second create), and the third step saves
 * the list of the face that is on screen when the person leaves it.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PhoneUiProvider } from "../../root/phone-ui-context";
import { OnboardingScreen } from "../OnboardingScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
const mutateAsync = jest.fn<Promise<object>, [unknown]>(async () => ({}));
const createTask = jest.fn<Promise<{ result: object }>, [unknown]>(
  async (draft) => ({
    result: {
      id: "t1",
      title: (draft as { draft: { title: string } }).draft.title,
      estimatedMinutes: 30,
      scheduledStart: null,
    },
  })
);
let settingsData: unknown;
let cache: unknown;

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryData: () => cache }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: settingsData }),
  useUpdateSettings: () => ({ mutateAsync }),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({ data: [] }),
}));
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  useCreateTask: () => ({ mutateAsync: (a: unknown) => createTask(a) }),
}));
jest.mock("@/lib/needt3/hooks/core", () => ({
  browserTimeZone: () => "Europe/Zurich",
  fetchJson: async () => ({ workHourStart: 9, workHourEnd: 17 }),
  sendJson: async () => ({}),
}));
// the picker pulls the icon set, which jest cannot parse (ESM); icons are not under test
jest.mock(
  "lucide-react",
  () =>
    new Proxy(
      { __esModule: true },
      { get: (t, k) => (k in t ? (t as never)[k] : () => null) }
    )
);
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  settingsData = { timeZone: "Europe/Zurich", prefs: {}, theme: "system" };
  cache = { prefs: {} };
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
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

const show = (ui: "phone" | "desktop", startAt?: string) =>
  act(async () => {
    root.render(
      h(PhoneUiProvider, { value: ui }, h(OnboardingScreen, { startAt }))
    );
  });
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const step = () =>
  q("[data-onboarding-step]")?.getAttribute("data-onboarding-step");
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

describe("crossing 700px in setup", () => {
  it("keeps the step and the typed task title", async () => {
    await show("phone", "first");
    expect(q("[data-ma-step]")).not.toBeNull();
    type(q<HTMLInputElement>("[data-ob-composer]")!, "Plan the week");
    await show("desktop", "first");
    expect(q("[data-ma-step]")).toBeNull();
    expect(step()).toBe("first");
    expect(q<HTMLInputElement>("[data-ob-composer]")!.value).toBe(
      "Plan the week"
    );
  });

  it("creates the first task once and shows it on the other face", async () => {
    await show("desktop", "first");
    type(q<HTMLInputElement>("[data-ob-composer]")!, "Plan the week");
    await click(q("[data-axs-next]")!);
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(step()).toBe("placed");
    await show("phone", "first");
    expect(step()).toBe("placed");
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Plan the week");
  });

  it("the third step saves the list of the face on screen when it is left", async () => {
    await show("phone", "sidebar");
    await show("desktop", "sidebar");
    await click(q("[data-axs-next]")!);
    const prefs = (
      mutateAsync.mock.calls.at(-1)?.[0] as { prefs: Record<string, unknown> }
    ).prefs;
    expect(prefs).toHaveProperty("sidebarTiles");
    expect(prefs).not.toHaveProperty("mobileTiles");
  });
});
