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

describe("OverviewScreen", () => {
  it("shows the counts and the short build SHAs", async () => {
    await renderWith({
      ok: true,
      status: 200,
      body: {
        overview: {
          users: { total: 120, newLast7Days: 7 },
          activeTrials: 15,
          plans: { pro: 11, lifetime: 4, free: 90 },
          waitlist: 33,
          generatedAt: "2026-10-16T12:00:00.000Z",
        },
        build: { buildSha: SHA, workerBuildSha: SHA },
      },
    });
    expect(stat("Users")).toBe("120");
    expect(stat("New in 7 days")).toBe("7");
    expect(stat("Active trials")).toBe("15");
    expect(stat("Pro")).toBe("11");
    expect(stat("Lifetime")).toBe("4");
    expect(stat("Free")).toBe("90");
    expect(stat("Waitlist")).toBe("33");
    expect(stat("App build")).toBe("0123456");
    expect(stat("Worker build")).toBe("0123456");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("warns when the worker runs a different build than the app", async () => {
    await renderWith({
      ok: true,
      status: 200,
      body: {
        overview: {
          users: { total: 1, newLast7Days: 0 },
          activeTrials: 0,
          plans: { pro: 0, lifetime: 0, free: 1 },
          waitlist: 0,
          generatedAt: "2026-10-16T12:00:00.000Z",
        },
        build: { buildSha: SHA, workerBuildSha: "f".repeat(40) },
      },
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /different build/
    );
  });

  it("says so when the worker has reported no build", async () => {
    await renderWith({
      ok: true,
      status: 200,
      body: {
        overview: {
          users: { total: 1, newLast7Days: 0 },
          activeTrials: 0,
          plans: { pro: 0, lifetime: 0, free: 1 },
          waitlist: 0,
          generatedAt: "2026-10-16T12:00:00.000Z",
        },
        build: { buildSha: SHA, workerBuildSha: null },
      },
    });
    expect(stat("Worker build")).toBe("unknown");
  });

  it("shows the refusal instead of numbers for a non-admin", async () => {
    await renderWith({ ok: false, status: 403, body: { error: "Forbidden" } });
    expect(host.textContent).toContain("Admin access required.");
    expect(stat("Users")).toBeUndefined();
  });
});
