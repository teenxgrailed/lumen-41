/**
 * @jest-environment jsdom
 *
 * Bug reports: the list, the status filter, the detail on click, and a
 * GitHub link only when it is https.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import { BugsScreen } from "../BugsScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  description: "The page went blank",
  reproductionSteps: "Open Today",
  expectedBehavior: "A list",
  actualBehavior: "Nothing",
  route: "/today",
  appVersion: "abc1234",
  viewport: "390x844",
  theme: "dark",
  browser: "Safari",
  githubSyncError: null,
  attachments: [],
  user: { id: "u1", name: null, email: "pat@example.com" },
};

const reports = [
  {
    ...base,
    id: "b1",
    title: "Blank Today",
    severity: "HIGH",
    status: "OPEN",
    githubIssueUrl: "https://github.com/o/r/issues/1",
    createdAt: "2026-10-16T09:00:00.000Z",
  },
  {
    ...base,
    id: "b2",
    title: "Odd colour",
    severity: "LOW",
    status: "RESOLVED",
    githubIssueUrl: "javascript:alert(1)",
    createdAt: "2026-10-15T09:00:00.000Z",
  },
];

let host: HTMLDivElement;
let root: Root;

async function mount(response: { ok: boolean; status: number; body: unknown }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  global.fetch = jest.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  })) as unknown as typeof fetch;
  await act(async () => {
    root.render(h(V3PortalScope, null, h(BugsScreen)));
  });
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const rows = () => host.querySelectorAll("[data-admin-bug]");
const toggle = (id: string) =>
  host.querySelector<HTMLElement>(
    `[data-admin-bug="${id}"] [data-admin-bug-toggle]`
  )!;

describe("BugsScreen", () => {
  it("lists every report with severity, status and sender", async () => {
    await mount({ ok: true, status: 200, body: { reports } });
    expect(rows()).toHaveLength(2);
    const first = host.querySelector('[data-admin-bug="b1"]')!.textContent!;
    expect(first).toContain("Blank Today");
    expect(first).toContain("High");
    expect(first).toContain("Open");
    expect(first).toContain("pat@example.com");
    expect(first).toContain("abc1234");
  });

  it("opens the full report on click", async () => {
    await mount({ ok: true, status: 200, body: { reports } });
    expect(host.querySelector("[data-admin-bug-detail]")).toBeNull();
    await act(async () => toggle("b1").click());
    const detail = host.querySelector("[data-admin-bug-detail]")!.textContent!;
    expect(detail).toContain("The page went blank");
    expect(detail).toContain("Open Today");
    expect(detail).toContain("/today");
    expect(
      host.querySelector<HTMLAnchorElement>("[data-admin-bug-detail] a")?.href
    ).toBe("https://github.com/o/r/issues/1");
  });

  it("never draws a non-https issue URL as a link", async () => {
    await mount({ ok: true, status: 200, body: { reports } });
    await act(async () => toggle("b2").click());
    expect(host.querySelector("[data-admin-bug-detail] a")).toBeNull();
  });

  it("says so when there are none", async () => {
    await mount({ ok: true, status: 200, body: { reports: [] } });
    expect(host.textContent).toContain("No reports.");
  });

  it("shows the refusal for a non-admin", async () => {
    await mount({ ok: false, status: 403, body: { error: "Forbidden" } });
    expect(host.textContent).toContain("Admin access required.");
    expect(rows()).toHaveLength(0);
  });
});
