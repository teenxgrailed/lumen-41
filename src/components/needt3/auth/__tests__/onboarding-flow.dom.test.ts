/**
 * @jest-environment jsdom
 *
 * The first-run flow, mounted for real on both faces: four uses to pick from
 * (the first pick drives the sample), calendars limited to what the server
 * can run, the per-day hours editor, an Import step only when an importer is
 * configured, and "Open my day" creating the sample day then landing on
 * Today. Crossing 700px keeps the step and the picks.
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
const sendJson = jest.fn<Promise<object>, unknown[]>(async () => ({}));
let settingsData: unknown;
let cache: unknown;
let providers: unknown;
let imports: unknown;

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: () => cache,
    invalidateQueries: async () => undefined,
  }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey.includes("onboarding-providers") ? providers : imports,
  }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: settingsData }),
  useUpdateSettings: () => ({ mutateAsync }),
}));
jest.mock("@/lib/needt3/hooks/account", () => ({
  useSchedule: () => ({
    data: {
      weekHours: [1, 2, 3, 4, 5, 6, 0].map((day) => ({
        day,
        on: day >= 1 && day <= 5,
        ranges: day >= 1 && day <= 5 ? [{ start: "09:00", end: "17:00" }] : [],
      })),
    },
  }),
  useUpdateSchedule: () => ({ mutateAsync: async () => ({}) }),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({ data: [] }),
}));
jest.mock("@/lib/needt3/hooks/core", () => ({
  browserTimeZone: () => "Europe/Zurich",
  fetchJson: async () => ({}),
  sendJson: (...a: unknown[]) => sendJson(...a),
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
  providers = { google: { configured: true }, outlook: { configured: false } };
  imports = { enabled: false, sources: {} };
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
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));
const step = () =>
  q("[data-onboarding-step]")?.getAttribute("data-onboarding-step");
const click = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const rowByTitle = (title: string) =>
  qa("button").find((b) => b.textContent?.includes(title));
const next = () => q<HTMLButtonElement>("[data-axs-next]")!;

describe("desktop", () => {
  it("offers four uses and holds Continue until one is picked", async () => {
    await show("desktop");
    expect(step()).toBe("use");
    for (const t of ["Work", "Study", "Personal", "Side project"])
      expect(rowByTitle(t)).toBeDefined();
    expect(next().disabled).toBe(true);
    await click(rowByTitle("Study")!);
    expect(next().disabled).toBe(false);
  });

  it("walks use, calendar, hours and creates the sample for the first pick", async () => {
    await show("desktop");
    await click(rowByTitle("Side project")!);
    await click(rowByTitle("Work")!);
    await click(next());
    expect(step()).toBe("calendar");
    // Google has keys; Outlook does not; iCloud needs none.
    expect(rowByTitle("Google Calendar")).toBeDefined();
    expect(rowByTitle("Outlook")).toBeUndefined();
    expect(rowByTitle("iCloud Calendar")).toBeDefined();
    await click(next());
    expect(step()).toBe("hours");
    // Seven day rows, Mon-Fri on, prefilled 09:00-17:00.
    expect(q("[data-ob-hours]")).not.toBeNull();
    expect(host.textContent).toContain("Mon");
    expect(host.textContent).toContain("Sun");
    expect(host.textContent).toContain("09:00");
    expect(host.textContent).toContain("17:00");
    expect(next().textContent).toBe("Open my day");
    await click(next());
    expect(sendJson).toHaveBeenCalledWith("/api/onboarding/sample", "POST", {
      uses: ["side", "work"],
      timeZone: "Europe/Zurich",
    });
    expect(push).toHaveBeenCalledWith("/today");
  });

  it("the iCloud row opens the existing guide inline", async () => {
    await show("desktop", "calendar");
    expect(q("[data-ob-icloud-guide]")).toBeNull();
    await click(rowByTitle("iCloud Calendar")!);
    expect(q("[data-ob-icloud-guide]")).not.toBeNull();
    expect(q("[data-cn-guide]")).not.toBeNull();
  });

  it("has no Import step when no importer is configured", async () => {
    await show("desktop", "hours");
    expect(next().textContent).toBe("Open my day");
    expect(qa("[data-ob-import]")).toHaveLength(0);
  });

  it("shows Import last, only for a configured importer", async () => {
    imports = {
      enabled: true,
      sources: { todoist: { configured: true }, notion: { configured: false } },
    };
    await show("desktop", "hours");
    expect(next().textContent).toBe("Continue");
    await click(next());
    expect(step()).toBe("import");
    expect(rowByTitle("Todoist")).toBeDefined();
    expect(rowByTitle("Notion")).toBeUndefined();
    expect(next().textContent).toBe("Open my day");
  });

  it("Skip setup creates no sample, records the finish and opens Today", async () => {
    await show("desktop");
    await click(q("[data-ob-skip]")!);
    expect(sendJson).not.toHaveBeenCalledWith(
      "/api/onboarding/sample",
      expect.anything(),
      expect.anything()
    );
    expect(sendJson).toHaveBeenCalledWith("/api/onboarding", "POST", {});
    expect(push).toHaveBeenCalledWith("/today");
  });
});

describe("crossing 700px", () => {
  it("keeps the step and the picks, and finishes the same way on the phone", async () => {
    await show("desktop");
    await click(rowByTitle("Study")!);
    await show("phone");
    expect(q("[data-ma-step]")).not.toBeNull();
    expect(step()).toBe("use");
    expect(q('[data-ma-use="study"]')?.getAttribute("aria-pressed")).toBe(
      "true"
    );
    const go = () =>
      Array.from(host.querySelectorAll("button")).find((b) =>
        /^(Continue|Open my day)/.test(b.textContent ?? "")
      )!;
    await click(go());
    expect(step()).toBe("calendar");
    expect(q('[data-ma-cal="google"]')).not.toBeNull();
    expect(q('[data-ma-cal="outlook"]')).toBeNull();
    await click(go());
    expect(step()).toBe("hours");
    expect(q("[data-ob-hours]")).not.toBeNull();
    await click(go());
    expect(sendJson).toHaveBeenCalledWith(
      "/api/onboarding/sample",
      "POST",
      expect.objectContaining({ uses: ["study"] })
    );
    expect(push).toHaveBeenCalledWith("/today");
  });
});
