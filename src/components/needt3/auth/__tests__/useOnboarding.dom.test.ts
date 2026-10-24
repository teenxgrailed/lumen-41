/**
 * @jest-environment jsdom
 *
 * The onboarding controller's write guards, shared by the desktop and the
 * phone: no prefs write before settings have loaded, the per-day hours are
 * written only once loaded and only when valid, only providers the server has
 * keys for are offered, Import appears only when an importer can run, and
 * finishing creates the sample day for the FIRST use picked (Skip creates
 * none, and a failure never blocks Today).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { WeekHours } from "@/lib/work-week";

import { type Onboarding, useOnboarding } from "../useOnboarding";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
const mutateAsync = jest.fn<Promise<object>, [unknown]>(async () => ({}));
const scheduleWrite = jest.fn<Promise<object>, [unknown]>(async () => ({}));
const sendJson = jest.fn<Promise<object>, unknown[]>(async () => ({}));
const invalidate = jest.fn(async () => undefined);
const notifyError = jest.fn();
let settingsData: unknown;
let scheduleData: unknown;
let cache: unknown;
let providers: unknown;
let imports: unknown;

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: () => cache,
    invalidateQueries: invalidate,
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
  useSchedule: () => ({ data: scheduleData }),
  useUpdateSchedule: () => ({ mutateAsync: scheduleWrite }),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({ data: [] }),
}));
jest.mock("@/lib/needt3/hooks/core", () => ({
  browserTimeZone: () => "Europe/Zurich",
  fetchJson: jest.fn(),
  sendJson: (...a: unknown[]) => sendJson(...a),
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: (...a: unknown[]) => notifyError(...a), success: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const settings = (prefs: Record<string, unknown> = {}) => ({
  timeZone: "Europe/Zurich",
  prefs,
  theme: "system",
});

const day = (d: number, on: boolean) => ({
  day: d,
  on,
  ranges: on ? [{ start: "09:00", end: "17:00" }] : [],
});
const WEEK: WeekHours = [1, 2, 3, 4, 5, 6, 0].map((d) =>
  day(d, d >= 1 && d <= 5)
);

let host: HTMLDivElement;
let root: Root;
let ob: Onboarding;

function Probe({ startAt }: { startAt?: string }) {
  ob = useOnboarding({ startAt });
  return null;
}
const mount = (startAt?: string) =>
  act(async () => {
    root.render(h(Probe, { startAt }));
  });

beforeEach(() => {
  jest.clearAllMocks();
  settingsData = undefined;
  scheduleData = undefined;
  cache = undefined;
  providers = { google: { configured: true }, outlook: { configured: false } };
  imports = { enabled: false, sources: {} };
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

describe("before settings have loaded", () => {
  it("Skip and Open my day do nothing at all", async () => {
    await mount();
    expect(ob.ready).toBe(false);
    await act(async () => {
      await ob.finish(true);
    });
    expect(push).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(sendJson).not.toHaveBeenCalled();
  });
});

describe("prefs are replaced whole on the server", () => {
  it("with the cache empty, skipping writes nothing but still opens Today", async () => {
    settingsData = settings({ accent: "mint" });
    cache = undefined;
    await mount();
    await act(async () => {
      await ob.finish(true);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/today");
  });

  it("with it loaded, a patch is merged into every key already there", async () => {
    settingsData = settings({ accent: "mint", docsSort: "title" });
    cache = { prefs: { accent: "mint", docsSort: "title" } };
    await mount();
    await act(async () => {
      await ob.finish(true);
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      prefs: { accent: "mint", docsSort: "title", onboarded: true },
    });
  });
});

describe("the steps", () => {
  beforeEach(() => {
    settingsData = settings();
    cache = { prefs: {} };
  });

  it("are three without an importer", async () => {
    await mount();
    expect(ob.ids).toEqual(["use", "calendar", "hours"]);
  });

  it("gain Import only when an importer is enabled and has keys", async () => {
    imports = {
      enabled: true,
      sources: { todoist: { configured: false }, notion: { configured: true } },
    };
    await mount();
    expect(ob.ids).toEqual(["use", "calendar", "hours", "import"]);
    expect(ob.importSources.map((s) => s.id)).toEqual(["notion"]);
  });

  it("stay three when the imports flag is off, whatever has keys", async () => {
    imports = { enabled: false, sources: { notion: { configured: true } } };
    await mount();
    expect(ob.ids).toHaveLength(3);
  });

  it("offer only calendars the server has keys for; iCloud always", async () => {
    await mount();
    expect(ob.calendars.map((c) => c.id)).toEqual(["google", "apple"]);
    providers = { google: { configured: true }, outlook: { configured: true } };
    await mount();
    expect(ob.calendars.map((c) => c.id)).toEqual([
      "google",
      "apple",
      "outlook",
    ]);
    providers = undefined;
    await mount();
    expect(ob.calendars.map((c) => c.id)).toEqual(["apple"]);
  });

  it("cannot continue from the first step without a pick", async () => {
    await mount();
    expect(ob.canContinue).toBe(false);
    await act(async () => ob.toggleUse("study"));
    expect(ob.canContinue).toBe(true);
  });

  it("saves the picks, in order, when leaving the first step", async () => {
    await mount();
    await act(async () => ob.toggleUse("side"));
    await act(async () => ob.toggleUse("work"));
    await act(async () => {
      await ob.go(1);
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      prefs: { uses: ["side", "work"] },
    });
    expect(ob.id).toBe("calendar");
  });

  it("never moves past the last step shown", async () => {
    await mount("hours");
    await act(async () => {
      await ob.go(9);
    });
    expect(ob.id).toBe("hours");
  });
});

describe("working hours", () => {
  beforeEach(() => {
    settingsData = settings();
    cache = { prefs: {} };
  });

  it("are not written before the schedule has loaded", async () => {
    await mount("hours");
    expect(ob.weekReady).toBe(false);
    ob.saveWeek(WEEK);
    expect(scheduleWrite).not.toHaveBeenCalled();
  });

  it("are written, with the single-range columns, once loaded", async () => {
    scheduleData = { weekHours: WEEK };
    await mount("hours");
    expect(ob.weekReady).toBe(true);
    expect(ob.week).toBe(WEEK);
    ob.saveWeek(WEEK);
    expect(scheduleWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        weekHours: WEEK,
        workHourStart: 9,
        workHourEnd: 17,
      })
    );
  });

  it("an invalid week is never sent", async () => {
    scheduleData = { weekHours: WEEK };
    await mount("hours");
    ob.saveWeek(
      WEEK.map((d) => ({
        ...d,
        ranges: d.on ? [{ start: "17:00", end: "09:00" }] : d.ranges,
      }))
    );
    expect(scheduleWrite).not.toHaveBeenCalled();
  });

  it("a changed time zone is saved on the way out of the hours step", async () => {
    scheduleData = { weekHours: WEEK };
    await mount("hours");
    await act(async () => ob.setTz("Asia/Tokyo"));
    await act(async () => {
      await ob.go(0);
    });
    expect(mutateAsync).not.toHaveBeenCalled(); // going back saves nothing
    await act(async () => {
      await ob.finish();
    });
    expect(mutateAsync).toHaveBeenCalledWith({ timeZone: "Asia/Tokyo" });
  });
});

describe("finishing", () => {
  beforeEach(() => {
    settingsData = settings();
    cache = { prefs: {} };
    scheduleData = { weekHours: WEEK };
  });

  it("creates the sample day for the picks, then marks setup done and opens Today", async () => {
    await mount("hours");
    await act(async () => ob.toggleUse("study"));
    await act(async () => ob.toggleUse("personal"));
    await act(async () => {
      await ob.finish();
    });
    expect(sendJson).toHaveBeenCalledWith("/api/onboarding/sample", "POST", {
      uses: ["study", "personal"],
      timeZone: "Europe/Zurich",
    });
    // The picks are saved, then setup is marked done (the cache is a stub here).
    expect(mutateAsync).toHaveBeenCalledWith({
      prefs: { uses: ["study", "personal"] },
    });
    expect(mutateAsync).toHaveBeenCalledWith({ prefs: { onboarded: true } });
    expect(push).toHaveBeenCalledWith("/today");
    expect(
      sendJson.mock.invocationCallOrder[0] < push.mock.invocationCallOrder[0]
    ).toBe(true);
  });

  it("Skip creates no sample", async () => {
    await mount("hours");
    await act(async () => ob.toggleUse("work"));
    await act(async () => {
      await ob.finish(true);
    });
    expect(sendJson).toHaveBeenCalledTimes(1);
    expect(sendJson).toHaveBeenCalledWith("/api/onboarding", "POST", {});
    expect(push).toHaveBeenCalledWith("/today");
  });

  it("a failed sample never blocks Today", async () => {
    sendJson.mockRejectedValueOnce(new Error("down"));
    await mount("hours");
    await act(async () => ob.toggleUse("work"));
    await act(async () => {
      await ob.finish();
    });
    expect(push).toHaveBeenCalledWith("/today");
    expect(mutateAsync).toHaveBeenCalledWith({ prefs: { onboarded: true } });
  });
});
