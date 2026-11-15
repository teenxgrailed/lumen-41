/**
 * @jest-environment jsdom
 *
 * Overview: the counts and both build SHAs, and a plain message on failure.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { OverviewScreen } from "../OverviewScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SHA = "0123456789abcdef0123456789abcdef01234567";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

async function renderWith(response: {
  ok: boolean;
  status: number;
  body: unknown;
}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  }) as unknown as typeof fetch;
  await act(async () => {
    root.render(h(OverviewScreen));
  });
}

function stat(label: string) {
  return host.querySelector(`[data-admin-stat="${label}"] .admin-stat-value`)
    ?.textContent;
}

const goal = (value: number, target: number, deadline: string) => ({
  value,
  target,
  deadline,
  daysLeft: 15,
  met: value >= target,
});

function statsBody(over: Record<string, unknown> = {}) {
  return {
    stats: {
      excludeInternal: true,
      internal: { accounts: 4, weeklyActives: 2 },
      users: { total: 120, newLast7Days: 7 },
      activeTrials: 15,
      paying: { total: 3, activeNow: 3, creem: 3, apple: 0 },
      granted: { total: 9, pro: 6, lifetime: 2, gifts: 1 },
      free: 90,
      waitlist: 33,
      weeklyActives: 16,
      funnel: [
        { name: "account_created", users7Days: 12, users30Days: 40 },
        { name: "calendar_connected", users7Days: 8, users30Days: 20 },
        { name: "task_created", users7Days: 7, users30Days: 18 },
        { name: "replan_shown", users7Days: 3, users30Days: 6 },
        { name: "keep_applied", users7Days: 2, users30Days: 4 },
      ],
      sideEvents: [
        { name: "first_replan_card_shown", users7Days: 5, users30Days: 9 },
      ],
      weeks: [
        { from: "2026-10-29T12:00:00.000Z", activeUsers: 0 },
        { from: "2026-11-05T12:00:00.000Z", activeUsers: 6 },
      ],
      goals: {
        keep: goal(4, 5, "2026-11-30"),
        paying: goal(3, 10, "2026-12-31"),
        may: {
          weeklyActives: goal(16, 300, "2027-05-05"),
          paying: goal(3, 100, "2027-05-05"),
        },
      },
      generatedAt: "2026-11-15T12:00:00.000Z",
      ...over,
    },
    build: { buildSha: SHA, workerBuildSha: SHA },
  };
}

describe("OverviewScreen", () => {
  it("shows the counts and the short build SHAs", async () => {
    await renderWith({ ok: true, status: 200, body: statsBody() });
    expect(stat("Users")).toBe("120");
    expect(stat("New in 7 days")).toBe("7");
    expect(stat("Active trials")).toBe("15");
    expect(stat("Paying")).toBe("3");
    expect(stat("Granted")).toBe("9");
    expect(stat("Free")).toBe("90");
    expect(stat("Weekly actives")).toBe("16");
    expect(stat("Waitlist")).toBe("33");
    expect(stat("App build")).toBe("0123456");
    expect(stat("Worker build")).toBe("0123456");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("asks without internal accounts first, and with them when unticked", async () => {
    await renderWith({ ok: true, status: 200, body: statsBody() });
    const urls = () =>
      (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls()).toContain("/api/admin/overview");
    const box = host.querySelector(
      "[data-admin-internal-toggle] input"
    ) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(host.textContent).toContain("Exclude internal accounts (4)");
    await act(async () => {
      box.click();
    });
    expect(urls()).toContain("/api/admin/overview?internal=include");
  });

  it("warns when the worker runs a different build than the app", async () => {
    const body = statsBody();
    body.build = { buildSha: SHA, workerBuildSha: "f".repeat(40) };
    await renderWith({ ok: true, status: 200, body });
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /different build/
    );
  });

  it("says so when the worker has reported no build", async () => {
    const body = statsBody();
    body.build = { buildSha: SHA, workerBuildSha: null as unknown as string };
    await renderWith({ ok: true, status: 200, body });
    expect(stat("Worker build")).toBe("unknown");
  });

  it("shows the launch criteria first and the May goal below", async () => {
    await renderWith({ ok: true, status: 200, body: statsBody() });
    const goalText = (label: string) =>
      host.querySelector(`[data-admin-goal="${label}"] .admin-stat-value`)
        ?.textContent;
    expect(goalText("Keep pressed")).toBe("4 / 5");
    expect(goalText("Paying")).toBe("3 / 10");
    expect(goalText("Weekly actives")).toBe("16 / 300");
    expect(goalText("Paying, long goal")).toBe("3 / 100");
    expect(host.textContent).toContain("2026-11-30");
    expect(host.textContent).toContain("2027-05-05");
    expect(
      host.querySelectorAll("[data-admin-growth-trend] tbody tr")
    ).toHaveLength(2);
  });

  it("shows the activation funnel in order with 7 and 30 days", async () => {
    await renderWith({ ok: true, status: 200, body: statsBody() });
    const rows = [...host.querySelectorAll("[data-admin-funnel] tbody tr")].map(
      (tr) => tr.getAttribute("data-admin-funnel-step")
    );
    expect(rows).toEqual([
      "account_created",
      "calendar_connected",
      "task_created",
      "replan_shown",
      "keep_applied",
    ]);
    expect(
      host.querySelector('[data-admin-funnel-step="keep_applied"]')?.textContent
    ).toBe("Keep pressed24");
  });

  it("shows the refusal instead of numbers for a non-admin", async () => {
    await renderWith({ ok: false, status: 403, body: { error: "Forbidden" } });
    expect(host.textContent).toContain("Admin access required.");
    expect(stat("Users")).toBeUndefined();
  });
});
