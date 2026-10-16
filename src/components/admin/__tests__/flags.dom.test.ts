/**
 * @jest-environment jsdom
 *
 * Flags: every flag listed with its switch and rollout, the money warning on
 * billing_checkout, and a question before that flag is turned on.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import { FlagsScreen } from "../FlagsScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flags = [
  {
    key: "billing_checkout",
    enabled: false,
    rolloutPercentage: 0,
    description: null,
    exists: false,
    updatedAt: null,
  },
  {
    key: "design_v3",
    enabled: true,
    rolloutPercentage: 100,
    description: "Design v3",
    exists: true,
    updatedAt: "2026-10-12T00:00:00.000Z",
  },
];

let host: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; init?: RequestInit }>;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ flags }) };
  }) as unknown as typeof fetch;
  await act(async () => {
    root.render(h(V3PortalScope, null, h(FlagsScreen)));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const row = (key: string) =>
  host.querySelector<HTMLElement>(`[data-admin-flag="${key}"]`)!;
const patches = () => calls.filter((c) => c.init?.method === "PATCH");

async function toggle(key: string) {
  const input = row(key).querySelector<HTMLInputElement>(
    'input[role="switch"]'
  )!;
  await act(async () => {
    input.click();
  });
}

describe("FlagsScreen", () => {
  it("lists every flag and warns on billing_checkout only", async () => {
    expect(host.querySelectorAll("[data-admin-flag]")).toHaveLength(2);
    expect(
      row("billing_checkout").querySelector("[data-admin-warning]")?.textContent
    ).toBe("money: turn on only after Creem approval");
    expect(row("design_v3").querySelector("[data-admin-warning]")).toBeNull();
  });

  it("asks before turning billing_checkout on, and sends nothing until confirmed", async () => {
    await toggle("billing_checkout");
    expect(patches()).toHaveLength(0);
    const confirm = document.querySelector<HTMLButtonElement>(
      "[data-admin-confirm]"
    )!;
    expect(document.body.textContent).toContain("Creem approval");
    await act(async () => {
      confirm.click();
    });
    expect(patches()).toHaveLength(1);
    expect(patches()[0].url).toBe("/api/admin/feature-flags/billing_checkout");
    expect(JSON.parse(String(patches()[0].init?.body))).toEqual({
      enabled: true,
    });
  });

  it("switches an ordinary flag straight away", async () => {
    await toggle("design_v3");
    expect(patches()).toHaveLength(1);
    expect(JSON.parse(String(patches()[0].init?.body))).toEqual({
      enabled: false,
    });
  });
});
