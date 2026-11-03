/**
 * @jest-environment jsdom
 *
 * Every other surface that used to pitch Pro: with the page running as the
 * Mac App Store build (`window.__needtNative.distribution === "appstore"`),
 * none of them renders a price, an Upgrade / Get Pro / See plans / Try Pro
 * button or a link to the website. The same surface in a browser does render
 * its pitch, so a pass here is not an empty render. Detection is the real one.
 */
import { act, createElement as h } from "react";
import type { ReactElement } from "react";

import { type Root, createRoot } from "react-dom/client";

import { notify } from "@/lib/notifications";

import { AuthScreen } from "../auth/AuthScreen";
import { GoalsView, type GoalsViewProps } from "../goals/GoalsView";
import { notifyHabitsBlocked } from "../habits/HabitsScreen";
import { PlanButton, WeekLoad } from "../home/HomeParts";
import { HaBrief } from "../home/ha/HaBrief";
import { HaStats } from "../home/ha/HaWeek";
import { PhoneAuth } from "../phone/auth/PhoneAuth";
import { ConnectionsPhone } from "../phone/places/ConnectionsPhone";
import { notifyBoardsBlocked } from "../places/MoodboardsScreen";
import { StarterGameSlot } from "../starter-game/StarterGameSlot";
import { StBannerStack } from "../states/StBanner";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let planData: Record<string, unknown>;

jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: planData, refetch: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({ data: [] }),
}));
jest.mock("@/lib/needt3/hooks/ai-availability", () => ({
  useAiAvailable: () => ({ data: true }),
}));
jest.mock("@/lib/needt3/hooks/starter-game", () => ({
  useStarterGameStatus: () => ({
    data: { eligible: true, canPlay: false },
    isPending: false,
  }),
  useHideStarterGame: () => ({ mutate: jest.fn() }),
}));
// V3Root pulls in the whole stylesheet entry; the banners only ask the flag.
jest.mock("../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/lib/notifications", () => ({
  notify: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

const STORE = { platform: "mac-swift", distribution: "appstore" };

/** Words and shapes that sell something. None may render in a store build. */
const SELLING =
  /upgrade|see plans|get pro|try pro|try with pro|unlock .* with pro|choose a plan|checkout|free trial|start .* trial|[$€£]\s?\d|\bCHF\b|\/ ?(month|year)\b|waitlist|creem|pricing/i;

const noop = () => undefined;

const closedAuth = {
  mode: "login" as const,
  onMode: noop,
  onDone: noop,
  onSubmit: async () => ({ ok: true as const }),
  allowSignup: false,
  signupClosed: true,
};

const goals: GoalsViewProps = {
  goals: [],
  pro: false,
  selectedId: null,
  detail: undefined,
  form: null,
  onSelect: noop,
  onNew: noop,
  onUpgrade: noop,
  onFormChange: noop,
  onFormClose: noop,
  onFormSave: noop,
  onCheckIn: noop,
  onStatus: noop,
  onArchive: noop,
  onAddTask: noop,
  onLinkTask: noop,
  onToggleTask: noop,
};

const query = { status: "success", fetchStatus: "idle", error: null };
const connectionsCtl = {
  accounts: { ...query, data: [] },
  catalog: {
    ...query,
    data: { catalog: [], integrations: [], isAdmin: false },
  },
  items: [],
  shown: [],
  confirm: null,
  busy: null,
  locked: true,
  tab: "ai",
  q: "",
  show: "all",
  counts: { issues: 0 },
  setup: null,
  api: false,
  caldav: false,
  caldavDone: noop,
  tasksLists: null,
  mcp: {
    apps: [],
    oauthUrl: null,
    reload: noop,
    disconnectApp: noop,
  },
  pickTab: noop,
  setQ: noop,
  setChip: noop,
  setShow: noop,
  setConfirm: noop,
  setSetup: noop,
  setApi: noop,
  setCaldav: noop,
  connect: noop,
  disconnect: noop,
  syncNow: noop,
  openTasksLists: noop,
  closeTasksLists: noop,
} as never;

interface Surface {
  name: string;
  el: () => ReactElement;
  /** What the same surface says in a browser (proves the case is not vacuous). */
  browser: RegExp;
  plan?: Record<string, unknown>;
}

const FREE = { kind: "free", trialEligible: true, trialEndsAt: null };

const SURFACES: Surface[] = [
  {
    name: "PhoneAuth, sign-ups closed",
    el: () => h(PhoneAuth, closedAuth),
    browser: /needt\.app/,
  },
  {
    name: "AuthScreen, sign-ups closed",
    el: () => h(AuthScreen, closedAuth),
    browser: /needt\.app/,
  },
  {
    name: "HaBrief, locked",
    el: () => h(HaBrief, { locked: true, onUpgrade: noop }),
    browser: /Try Pro/,
  },
  {
    name: "HaStats, locked",
    el: () =>
      h(HaStats, {
        week: {
          done: 0,
          bars: [],
          labels: [],
          today: 0,
          best: "-",
          streak: 0,
        },
        total: 0,
        totalLabel: "done this week",
        projects: [],
        kpis: [],
        range: "Week",
        onRange: noop,
        locked: true,
        onUpgrade: noop,
      }),
    browser: /Try Pro free/,
  },
  {
    name: "WeekLoad, Free",
    el: () =>
      h(WeekLoad, {
        days: [],
        cap: { min: 480, weekends: false, start: "09:00", end: "17:00" },
        pro: false,
        onCalendar: noop,
        onUpgrade: noop,
      }),
    browser: /Upgrade/,
  },
  {
    name: "PlanButton, Free",
    el: () =>
      h(PlanButton, {
        pro: false,
        canPlan: true,
        onPlan: noop,
        onLocked: noop,
      }),
    browser: /Unlock Plan my day with Pro/,
  },
  {
    name: "GoalsView, Free",
    el: () => h(GoalsView, goals),
    browser: /See plans/,
  },
  {
    name: "StBannerStack, trial ending",
    el: () => h(StBannerStack, {}),
    plan: { kind: "trial", trialDaysLeft: 2, trialEndsAt: "2099-01-01" },
    browser: /trial ends/i,
  },
  {
    name: "StBannerStack, payment failed",
    el: () => h(StBannerStack, {}),
    plan: { kind: "monthly", paymentFailed: true },
    browser: /card/i,
  },
  {
    name: "StarterGameSlot, locked",
    el: () => h(StarterGameSlot, { screen: "home" }),
    browser: /Try with Pro/,
  },
  {
    name: "ConnectionsPhone, AI tools on Free",
    el: () => h(ConnectionsPhone, { c: connectionsCtl }),
    browser: /Get Pro|Try Pro/,
  },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  // jsdom has no canvas: the sky engine bails out on a null context
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  planData = FREE;
  jest.mocked(notify.info).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
});

const asStore = () => {
  (window as unknown as { __needtNative?: unknown }).__needtNative = STORE;
};

/** What a person can read: the text plus tooltips and labels. */
function visible() {
  const attrs = Array.from(
    host.querySelectorAll("[title],[aria-label]")
  ).flatMap((el) => [el.getAttribute("title"), el.getAttribute("aria-label")]);
  return [host.textContent, ...attrs].filter(Boolean).join(" | ");
}

function mount(s: Surface) {
  planData = s.plan ?? FREE;
  act(() => root.render(s.el()));
}

describe.each(SURFACES)("$name", (s) => {
  it("store build: no price, no pitch, no link to the website", () => {
    asStore();
    mount(s);
    expect(visible()).not.toMatch(SELLING);
    const hrefs = Array.from(host.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href")
    );
    expect(
      hrefs.filter((x) => /needt\.app|checkout|pricing/i.test(x ?? ""))
    ).toEqual([]);
    for (const b of Array.from(host.querySelectorAll("button"))) {
      expect(b.textContent ?? "").not.toMatch(SELLING);
    }
  });

  it("browser: the same surface still makes its pitch", () => {
    mount(s);
    expect(visible()).toMatch(s.browser);
  });
});

describe("limit notices", () => {
  it("store build: the Free limit is stated and points nowhere", () => {
    asStore();
    notifyHabitsBlocked();
    notifyBoardsBlocked();
    const calls = jest.mocked(notify.info).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [message, options] of calls) {
      expect(message).not.toMatch(SELLING);
      expect(options).toBeUndefined();
    }
  });

  it("browser: the notice offers the plans", () => {
    notifyHabitsBlocked();
    notifyBoardsBlocked();
    for (const [message, options] of jest.mocked(notify.info).mock.calls) {
      expect(message).toMatch(/upgrade/i);
      expect(options).toEqual({
        action: { label: "See plans", onClick: expect.any(Function) },
      });
    }
  });
});
