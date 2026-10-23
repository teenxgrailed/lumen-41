/**
 * @jest-environment jsdom
 *
 * Phone Settings, mounted for real against the real hooks (only `fetch` is
 * faked): the list opens a page and Back / Esc return; every control that
 * writes does so through the desktop's guards (nothing is written before
 * settings, the schedule or the alerts have loaded, prefs are merged into the
 * loaded map, a locked choice opens the paywall instead of writing); the
 * pill takes three places and refuses a fourth; Connections leaves Settings;
 * Sign out is the existing flow once; the Esc listener is removed on unmount.
 */
import { act, createElement as h, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { MarkProvider } from "../../../settings/SettingsContext";
import type { PhoneSectionId } from "../../../settings/derive";
import { PkTheme } from "../../kit";
import type { MenuPlaceId } from "../../menu/places";
import { usePhoneOverlays } from "../../overlays/store";
import { PhoneSettings } from "../PhoneSettings";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = jest.fn();
const mockSignOut = jest.fn();
const mockClear = jest.fn();
const mockNotify = jest.fn();
const mockSignOutAll = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Maksym K", email: "m@needt.app", image: null } },
  }),
  signOut: (...a: unknown[]) => mockSignOut(...a),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
}));
jest.mock("@/lib/auth/client-sign-out", () => ({
  signOutOfNeedt: (...a: unknown[]) => mockSignOutAll(...a),
}));
jest.mock("@/lib/pwa/offline-client", () => ({
  clearNeedtOfflineData: () => mockClear(),
}));
jest.mock("@/components/settings/AccountSettings", () => ({
  AccountSettings: () =>
    jest
      .requireActual<typeof import("react")>("react")
      .createElement("div", { "data-stub": "account-settings" }),
}));
jest.mock("@/lib/notifications", () => ({
  notify: {
    info: (...a: unknown[]) => mockNotify("info", ...a),
    success: (...a: unknown[]) => mockNotify("success", ...a),
    error: (...a: unknown[]) => mockNotify("error", ...a),
    warning: (...a: unknown[]) => mockNotify("warning", ...a),
  },
}));

/* ---------- fake network ---------- */

const SETTINGS = {
  theme: "light",
  defaultView: "week",
  timeZone: "Europe/Zurich",
  weekStartDay: "monday",
  timeFormat: "24h",
  prefs: { accent: "blue", offline: true, keepMe: "yes" },
};
const SCHEDULE = {
  workDays: "[1,2,3,4,5]",
  workHourStart: 9,
  workHourEnd: 17,
  bufferMinutes: 15,
};
const ALERTS = {
  dailyPlan: true,
  dailyPlanTime: "08:30",
  mailPlan: false,
  nudges: false,
  weeklyReview: true,
  focusEnded: true,
};
const billing = (over: Record<string, unknown> = {}) => ({
  configured: true,
  plan: "FREE",
  isTrial: false,
  trialEndsAt: null,
  status: "",
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManageBilling: false,
  lifetimeAvailable: true,
  ...over,
});

const URLS = {
  settings: "/api/user-settings",
  schedule: "/api/auto-schedule-settings",
  alerts: "/api/notification-settings",
  billing: "/api/billing",
};
let routes: Record<string, unknown>;
interface Write {
  url: string;
  method: string;
  body: Record<string, unknown>;
}
let writes: Write[];
/** While set, every write waits for it: a request that is still in flight. */
let hold: Promise<unknown> | null;
/** While set, writes answer 500. */
let failWrites = false;

const reply = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
  });
const fakeFetch = (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (method !== "GET") {
    writes.push({
      url,
      method,
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    if (failWrites)
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Error",
        text: () => Promise.resolve("{}"),
      });
    return hold ? hold.then(() => reply({})) : reply({});
  }
  // a route that is not set never answers: that source has not loaded
  return url in routes ? reply(routes[url]) : new Promise<never>(() => {});
};

/* ---------- harness ---------- */

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const onClose = jest.fn();
const onMark = jest.fn();

function Harness({ initial }: { initial: PhoneSectionId | null }) {
  const [page, setPage] = useState<PhoneSectionId | null>(initial);
  const [menu, setMenu] = useState(false);
  const [pill, setPill] = useState<MenuPlaceId[] | null>(null);
  return h(
    QueryClientProvider,
    { client },
    h(
      PkTheme.Provider,
      { value: "light" },
      h(
        MarkProvider,
        { value: onMark },
        h(PhoneSettings, {
          open: true,
          onClose,
          page,
          onPage: setPage,
          saved: 0,
          menu,
          onMenu: setMenu,
          pill,
          onPill: setPill,
        })
      )
    )
  );
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};
const mount = async (initial: PhoneSectionId | null = null) => {
  await act(async () => {
    root.render(h(Harness, { initial, key: String(initial) }));
  });
  await flush();
};
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const all = <T extends Element>(sel: string) =>
  Array.from(host.querySelectorAll<T>(sel));
const tap = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
};
const press = (key: string) =>
  act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
const sw = (label: string) =>
  q<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`);
const settingsWrites = () => writes.filter((w) => w.url === URLS.settings);

beforeEach(() => {
  routes = {};
  writes = [];
  hold = null;
  failWrites = false;
  mockSignOutAll.mockReset();
  mockSignOutAll.mockResolvedValue(undefined);
  onClose.mockClear();
  onMark.mockClear();
  mockPush.mockClear();
  mockSignOut.mockClear();
  mockClear.mockReset();
  mockNotify.mockClear();
  usePhoneOverlays.setState({ paywall: false });
  useNeedt3Ui.setState({ theme: "system", accent: "blue" });
  (globalThis as { fetch?: unknown }).fetch = jest.fn(fakeFetch);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  client.clear();
});

/* ---------- tests ---------- */

describe("the list and its pages", () => {
  it("shows you, the Pro plate on Free and a row for every page", async () => {
    routes[URLS.billing] = billing();
    await mount();
    expect(q("[data-ps-profile]")?.textContent).toContain("Maksym K");
    expect(q("[data-ps-tier]")?.textContent).toBe("Free");
    expect(q("[data-ps-pro]")).not.toBeNull();
    for (const id of [
      "account",
      "plan",
      "general",
      "appearance",
      "day",
      "tasks",
      "focus",
      "alerts",
      "menu",
      "data",
      "keys",
      "about",
    ])
      expect(q(`[data-ps-open="${id}"]`)).not.toBeNull();
    expect(q("[data-ps-connections]")).not.toBeNull();
    expect(q("[data-ps-signout]")).not.toBeNull();
    expect(q("[data-ps-open='sidebar']")).toBeNull();
  });

  it("a paid plan has no Pro plate", async () => {
    routes[URLS.billing] = billing({ plan: "PRO", interval: "year" });
    await mount();
    expect(q("[data-ps-pro]")).toBeNull();
    expect(q("[data-ps-tier]")?.textContent).toBe("Pro");
  });

  it("a row opens its page, Back returns to the list", async () => {
    await mount();
    expect(q("[data-ps-root]")?.getAttribute("data-ps-root")).toBe("main");
    await tap(q('[data-ps-open="day"]'));
    expect(q("[data-ps-root]")?.getAttribute("data-ps-root")).toBe("day");
    expect(q("[data-ps-title]")?.textContent).toBe("Your day");
    await tap(q("[data-ps-back]"));
    expect(q("[data-ps-root]")?.getAttribute("data-ps-root")).toBe("main");
    expect(q("[data-ps-back]")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Esc goes back from a page and closes from the list", async () => {
    await mount("alerts");
    expect(q("[data-ps-root]")?.getAttribute("data-ps-root")).toBe("alerts");
    await press("Escape");
    expect(q("[data-ps-root]")?.getAttribute("data-ps-root")).toBe("main");
    expect(onClose).not.toHaveBeenCalled();
    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc leaves a paywall that is over Settings to the paywall", async () => {
    await mount("plan");
    usePhoneOverlays.setState({ paywall: true });
    await press("Escape");
    expect(q("[data-ps-root]")?.getAttribute("data-ps-root")).toBe("plan");
  });

  it("the Esc listener is removed when Settings unmounts", async () => {
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");
    await mount("tasks");
    const keys = (spy: jest.SpyInstance) =>
      spy.mock.calls.filter((c) => c[0] === "keydown" && c[2] === true);
    expect(keys(add).length).toBeGreaterThan(0);
    await act(async () => root.render(null));
    expect(keys(remove).length).toBe(keys(add).length);
  });

  it("Connections closes Settings and goes there", async () => {
    await mount();
    await tap(q("[data-ps-connections]"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/connections");
  });
});

describe("nothing is written before the source has loaded", () => {
  it("Your day: the hours, the week, Hide done and the planning rows are off", async () => {
    await mount("day");
    const monday = q('[data-ps-day="1"] .ps-row')!;
    expect(monday.getAttribute("aria-disabled")).toBe("true");
    expect(monday.tagName).toBe("DIV");
    await tap(monday);
    expect(q("[data-ps-picker]")).toBeNull();
    expect(q('[data-ps-pick="1-0-start"]')).toBeNull();
    expect(sw("Hide done in calendar")?.disabled).toBe(true);
    await tap(sw("Hide done in calendar"));
    for (const b of all<HTMLButtonElement>("[data-ps-seg]"))
      expect(b.disabled).toBe(true);
    expect(writes).toEqual([]);
  });

  it("General, Tasks, Focus and Data switches are off until prefs load", async () => {
    await mount("general");
    expect(sw("Offline mode")?.disabled).toBe(true);
    await tap(sw("Offline mode"));
    await mount("focus");
    expect(sw("Hide notifications")?.disabled).toBe(true);
    await mount("data");
    expect(sw("Share usage data")?.disabled).toBe(true);
    expect(writes).toEqual([]);
  });

  it("Notifications: off until the alert columns load", async () => {
    await mount("alerts");
    expect(sw("Overdue notification")?.disabled).toBe(true);
    expect(sw("Focus ended notification")?.disabled).toBe(true);
    expect(sw("Daily plan notification")).toBeFalsy();
    expect(sw("Weekly review notification")).toBeFalsy();
    expect(writes).toEqual([]);
  });

  it("Appearance: an accent is not written (or shown as chosen) before prefs load", async () => {
    routes[URLS.billing] = billing({ plan: "PRO", interval: "year" });
    await mount("appearance");
    await tap(q('[data-ps-accent="pink"]'));
    expect(settingsWrites()).toEqual([]);
    expect(useNeedt3Ui.getState().accent).toBe("blue");
  });

  it("Menu: the rows are off until prefs load", async () => {
    await mount();
    await tap(q('[data-ps-open="menu"]'));
    await tap(q('[data-ps-menu-place="mail"]'));
    expect(writes).toEqual([]);
    expect(q('[data-ps-slot="home"]')?.hasAttribute("disabled")).toBe(true);
  });
});

describe("writes once loaded, through the desktop's rules", () => {
  beforeEach(() => {
    routes[URLS.settings] = SETTINGS;
    routes[URLS.schedule] = SCHEDULE;
    routes[URLS.alerts] = ALERTS;
  });

  it("a pref is merged into the loaded map, never written alone", async () => {
    await mount("general");
    expect(sw("Offline mode")?.disabled).toBe(false);
    await tap(sw("Offline mode"));
    expect(settingsWrites()).toHaveLength(1);
    expect(settingsWrites()[0].method).toBe("PATCH");
    expect(settingsWrites()[0].body).toEqual({
      prefs: { ...SETTINGS.prefs, offline: false },
    });
    expect(onMark).toHaveBeenCalled();
  });

  it("Focus: Animate the logo is stored inverted (stopMark)", async () => {
    await mount("focus");
    await tap(sw("Animate the logo"));
    expect(settingsWrites()[0].body).toEqual({
      prefs: { ...SETTINGS.prefs, stopMark: true },
    });
  });

  it("a day's hours change alone; the other days are written back as they were", async () => {
    await mount("day");
    await tap(q('[data-ps-day="3"] .ps-row'));
    await tap(q('[data-ps-pick="3-0-start"]'));
    expect(q("[data-ps-picker]")).not.toBeNull();
    // 17:00 would end the day where it starts: the list keeps start before end
    expect(q('[data-ps-option="17:00"]')).toBeNull();
    await tap(q('[data-ps-option="08:00"]'));
    const w = writes.filter((x) => x.url === URLS.schedule);
    expect(w).toHaveLength(1);
    const body = w[0].body as {
      weekHours: { day: number; on: boolean; ranges: unknown[] }[];
      workDays: string;
      workHourStart: number;
      workHourEnd: number;
    };
    const day = (n: number) => body.weekHours.find((d) => d.day === n)!;
    expect(day(3).ranges).toEqual([{ start: "08:00", end: "17:00" }]);
    for (const n of [1, 2, 4, 5])
      expect(day(n).ranges).toEqual([{ start: "09:00", end: "17:00" }]);
    expect(day(6).on).toBe(false);
    expect(day(0).on).toBe(false);
    expect(body.workDays).toBe("[1,2,3,4,5]");
    expect(body.workHourStart).toBe(8);
    expect(body.workHourEnd).toBe(17);
  });

  it("a break adds a second range to that day only", async () => {
    await mount("day");
    await tap(q('[data-ps-day="2"] .ps-row'));
    await tap(q('[data-ps-add-range="2"]'));
    const w = writes.filter((x) => x.url === URLS.schedule);
    expect(w).toHaveLength(1);
    const hours = (
      w[0].body as { weekHours: { day: number; ranges: unknown[] }[] }
    ).weekHours;
    expect(hours.find((d) => d.day === 2)!.ranges).toHaveLength(2);
    expect(hours.find((d) => d.day === 1)!.ranges).toHaveLength(1);
  });

  it("turning a weekend day on writes the week with the weekdays untouched", async () => {
    await mount("day");
    await tap(q('[data-ps-day="6"] .ps-row'));
    await tap(sw("Saturday is a working day"));
    const w = writes.filter((x) => x.url === URLS.schedule);
    expect(w).toHaveLength(1);
    const body = w[0].body as {
      weekHours: { day: number; on: boolean; ranges: unknown[] }[];
      workDays: string;
    };
    expect(body.workDays).toBe("[1,2,3,4,5,6]");
    expect(body.weekHours.find((d) => d.day === 6)!.on).toBe(true);
    for (const n of [1, 2, 3, 4, 5])
      expect(body.weekHours.find((d) => d.day === n)!.ranges).toEqual([
        { start: "09:00", end: "17:00" },
      ]);
  });

  it("the time format is a settings column", async () => {
    await mount("day");
    await tap(q('button[role="radio"][data-ps-seg="12h"]'));
    expect(settingsWrites()[0].body).toEqual({ timeFormat: "12h" });
  });

  it("the week start and the calendar view are settings columns", async () => {
    await mount("day");
    await tap(q('button[role="radio"][data-ps-seg="sunday"]'));
    expect(settingsWrites()[0].body).toEqual({ weekStartDay: "sunday" });
    await tap(q('button[role="radio"][data-ps-seg="days"]'));
    expect(settingsWrites()[1].body).toEqual({ defaultView: "days" });
  });

  it("Hide done is the calendar's own pref, merged", async () => {
    await mount("day");
    await tap(sw("Hide done in calendar"));
    expect(settingsWrites()[0].body).toEqual({
      prefs: { ...SETTINGS.prefs, calHideDone: true },
    });
  });

  it("Planning options fold open to the gap between tasks", async () => {
    await mount("day");
    expect(q("[data-ps-adv]")).not.toBeNull();
    await tap(q("[data-ps-adv]"));
    expect(sw("Plan on weekends")).toBeNull();
    const w = writes.filter((x) => x.url === URLS.schedule);
    expect(w).toHaveLength(0);
  });

  it("an alert switch patches the notification columns", async () => {
    await mount("alerts");
    await tap(sw("Overdue notification"));
    const w = writes.filter((x) => x.url === URLS.alerts);
    expect(w).toHaveLength(1);
    expect(w[0].body).toEqual({ nudges: true });
  });

  it("the Focus ended switch patches focusEnded", async () => {
    await mount("alerts");
    await tap(sw("Focus ended notification"));
    const w = writes.filter((x) => x.url === URLS.alerts);
    expect(w).toHaveLength(1);
    expect(w[0].body).toEqual({ focusEnded: false });
  });

  it("a picker sheet opens over the page, sets the value and closes", async () => {
    await mount("focus");
    await tap(q("[data-ps-root] .ps-row.is-open"));
    const list = q("[data-ps-picker]");
    expect(list?.getAttribute("role")).toBe("listbox");
    await tap(q('[data-ps-option="25"]'));
    expect(settingsWrites()[0].body).toEqual({
      prefs: { ...SETTINGS.prefs, len: "25" },
    });
  });

  it("Pro: an accent is written into prefs and the look follows", async () => {
    routes[URLS.billing] = billing({ plan: "PRO", interval: "year" });
    await mount("appearance");
    await tap(q('[data-ps-accent="pink"]'));
    expect(settingsWrites()[0].body).toEqual({
      prefs: { ...SETTINGS.prefs, accent: "pink" },
    });
    expect(useNeedt3Ui.getState().accent).toBe("pink");
  });

  it("a theme is a settings column and the look follows at once", async () => {
    routes[URLS.billing] = billing();
    await mount("appearance");
    await tap(q('[data-ps-theme="dark"]'));
    expect(settingsWrites()[0].body).toEqual({ theme: "dark" });
    expect(useNeedt3Ui.getState().theme).toBe("dark");
  });
});

describe("Free keeps its gates", () => {
  beforeEach(() => {
    routes[URLS.settings] = SETTINGS;
    routes[URLS.billing] = billing();
  });

  it("a locked accent opens the paywall on it and writes nothing", async () => {
    await mount("appearance");
    await tap(q('[data-ps-accent="pink"]'));
    expect(usePhoneOverlays.getState().paywall).toBe("Accent colours");
    expect(settingsWrites()).toEqual([]);
    expect(useNeedt3Ui.getState().accent).toBe("blue");
  });

  it("the Time theme opens the paywall, Light and Dark stay free", async () => {
    await mount("appearance");
    await tap(q('[data-ps-theme="time"]'));
    expect(usePhoneOverlays.getState().paywall).toBe("Time theme");
    expect(settingsWrites()).toEqual([]);
    usePhoneOverlays.setState({ paywall: false });
    await tap(q('[data-ps-theme="light"]'));
    expect(settingsWrites()[0].body).toEqual({ theme: "light" });
  });

  it("Plan: See plans and the price rows open the paywall; nothing starts a checkout", async () => {
    await mount("plan");
    expect(q("[data-ps-trial-terms]")).not.toBeNull();
    await tap(q("[data-ps-see-plans]"));
    expect(usePhoneOverlays.getState().paywall).toBe(true);
    usePhoneOverlays.setState({ paywall: false });
    await tap(q('[data-ps-price="annual"]'));
    expect(usePhoneOverlays.getState().paywall).toBe(true);
    usePhoneOverlays.setState({ paywall: false });
    const row = all<HTMLElement>("[data-ps-root] .ps-row.is-open").find((r) =>
      r.textContent?.includes("Plan my day")
    )!;
    await tap(row);
    expect(usePhoneOverlays.getState().paywall).toBe("Plan my day");
    expect(
      (global.fetch as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes("checkout")
      )
    ).toBe(false);
  });

  it("Plan: no Start trial button unless the account can still have one", async () => {
    await mount("plan");
    expect(q("[data-ps-start-trial]")).toBeNull();
  });

  it("Plan: an eligible Free account starts the trial in place", async () => {
    routes[URLS.billing] = billing({ trialEligible: true });
    await mount("plan");
    await tap(q("[data-ps-start-trial]"));
    expect(writes.map((w) => [w.method, w.url])).toEqual([
      ["POST", "/api/billing/trial"],
    ]);
    expect(mockNotify).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("trial has started"),
      expect.anything()
    );
    expect(usePhoneOverlays.getState().paywall).toBe(false);
  });

  it("prices come from the pricing module, not the page", async () => {
    await mount("plan");
    const text = host.textContent ?? "";
    const { priceStrings } = jest.requireActual<
      typeof import("@/lib/needt3/pricing")
    >("@/lib/needt3/pricing");
    const P = priceStrings();
    expect(text).toContain(`${P.monthly} / month`);
    expect(text).toContain(`${P.yearly} / year`);
    expect(text).toContain(`${P.lifetime} one-time`);
    expect(text).not.toMatch(/\d+ of \d+ left/);
  });
});

describe("the pill", () => {
  beforeEach(() => {
    routes[URLS.settings] = SETTINGS;
  });

  it("takes three places and refuses a fourth; a short pill is not written", async () => {
    await mount();
    await tap(q('[data-ps-open="menu"]'));
    expect(q("[data-ps-slots]")?.getAttribute("data-ps-slots")).toBe(
      "home,docs,ask"
    );
    // take one out: the pill is short, nothing is saved
    await tap(q('[data-ps-slot="home"]'));
    expect(q("[data-ps-slots]")?.getAttribute("data-ps-slots")).toBe(
      "docs,ask"
    );
    expect(settingsWrites()).toEqual([]);
    // fill it again: now it is written, into the loaded prefs
    await tap(q('[data-ps-menu-place="mail"]'));
    expect(settingsWrites()).toHaveLength(1);
    expect(settingsWrites()[0].body).toEqual({
      prefs: { ...SETTINGS.prefs, mobileTiles: ["docs", "ask", "mail"] },
    });
    // a fourth is refused with a word, and writes nothing
    await tap(q('[data-ps-menu-place="tasks"]'));
    expect(settingsWrites()).toHaveLength(1);
    expect(mockNotify).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("three")
    );
  });
});

describe("sign out and the account", () => {
  it("Sign out clears the offline copy, then ends the session, once", async () => {
    let release: () => void = () => undefined;
    mockClear.mockImplementation(() => new Promise<void>((r) => (release = r)));
    await mount();
    const out = q("[data-ps-signout]");
    await tap(out);
    await tap(out);
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
    await act(async () => release());
    await flush();
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/auth/signin" });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("Sign out of all devices asks first, then revokes every session and signs out", async () => {
    await mount("account");
    await tap(q("[data-ps-signout-all]"));
    // asking: nothing sent yet
    expect(writes).toEqual([]);
    expect(q("[data-ps-signout-all-confirm]")).not.toBeNull();
    // Cancel puts the row back
    const cancel = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel"
    );
    await tap(cancel ?? null);
    expect(q("[data-ps-signout-all-confirm]")).toBeNull();
    expect(writes).toEqual([]);
    // confirm: one POST to the revoke route, then the one sign-out path
    await tap(q("[data-ps-signout-all]"));
    await tap(q("[data-ps-signout-all-confirm]"));
    expect(writes.map((w) => [w.method, w.url])).toEqual([
      ["POST", "/api/account/sessions/revoke"],
    ]);
    expect(mockSignOutAll).toHaveBeenCalledTimes(1);
  });

  it("a failed revoke says so and keeps the person signed in", async () => {
    failWrites = true;
    await mount("account");
    await tap(q("[data-ps-signout-all]"));
    await tap(q("[data-ps-signout-all-confirm]"));
    expect(mockSignOutAll).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      "error",
      "Could not sign out of all devices"
    );
    expect(q("[data-ps-signout-all]")).not.toBeNull();
  });

  it("Delete account opens the existing deletion flow under its row", async () => {
    await mount("account");
    expect(q('[data-stub="account-settings"]')).toBeNull();
    await tap(q("[data-ps-delete]"));
    expect(q('[data-stub="account-settings"]')).not.toBeNull();
    expect(q("[data-ps-delete]")?.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Data", () => {
  it("Export all asks the existing route once and says so", async () => {
    routes[URLS.settings] = SETTINGS;
    await mount("data");
    let release: () => void = () => undefined;
    hold = new Promise<void>((r) => (release = r));
    const b = q<HTMLButtonElement>("[data-ps-export-all]");
    await tap(b);
    // still in flight: a second tap does nothing
    expect(q<HTMLButtonElement>("[data-ps-export-all]")?.disabled).toBe(true);
    await tap(b);
    await act(async () => release());
    await flush();
    const w = writes.filter((x) => x.url === "/api/account/export");
    expect(w).toHaveLength(1);
    expect(w[0].method).toBe("POST");
    expect(mockNotify).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Export requested")
    );
  });
});
