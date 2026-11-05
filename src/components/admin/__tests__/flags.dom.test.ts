/**
 * @jest-environment jsdom
 *
 * Feature flags screen: the list, the switch asking before it turns a flag
 * off, a rollout of 100 asking first while a smaller one does not, and an
 * override added by email.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import { FlagsScreen } from "../FlagsScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));

const flags = [
  {
    key: "habits_quit",
    enabled: true,
    rolloutPercentage: 25,
    description: "Quit habits",
    overrides: 1,
    known: true,
    persisted: true,
  },
  {
    key: "ai_chatgpt_plan",
    enabled: false,
    rolloutPercentage: 0,
    description: null,
    overrides: 0,
    known: true,
    persisted: false,
  },
];

let host: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; init?: RequestInit }>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "PATCH") {
      return { ok: true, status: 200, json: async () => ({ flag: {} }) };
    }
    if (url === "/api/admin/feature-flags") {
      return { ok: true, status: 200, json: async () => ({ flags }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        flag: {
          overrides: [
            { userId: "u1", email: "ann@example.com", enabled: true },
          ],
        },
        history: [
          {
            id: "c1",
            actorEmail: "admin@needt.app",
            before: { enabled: false, rolloutPercentage: 0 },
            after: { enabled: true, rolloutPercentage: 25 },
            createdAt: "2026-11-05T09:30:00.000Z",
          },
        ],
      }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function mount() {
  await act(async () => {
    root.render(h(V3PortalScope, null, h(FlagsScreen)));
  });
}
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const row = (key: string) =>
  host.querySelector<HTMLElement>(`[data-admin-flag="${key}"]`)!;
const confirmButton = () =>
  document.querySelector<HTMLButtonElement>("[data-admin-confirm]");
const patches = () => calls.filter((c) => c.init?.method === "PATCH");

describe("FlagsScreen", () => {
  it("lists every flag with state, rollout, overrides and whether the row exists", async () => {
    await mount();
    expect(row("habits_quit").textContent).toContain("On");
    expect(row("habits_quit").textContent).toContain("Has row");
    expect(
      row("habits_quit").querySelector<HTMLInputElement>("input")!.value
    ).toBe("25");
    expect(row("ai_chatgpt_plan").textContent).toContain("No row yet");
  });

  it("asks before turning a flag off and sends nothing until confirmed", async () => {
    await mount();
    await click(row("habits_quit").querySelector("[data-admin-flag-toggle]")!);
    expect(confirmButton()).not.toBeNull();
    expect(patches()).toHaveLength(0);
    await click(confirmButton()!);
    expect(patches()).toHaveLength(1);
    expect(patches()[0].url).toBe("/api/admin/feature-flags/habits_quit");
    expect(JSON.parse(String(patches()[0].init?.body))).toEqual({
      enabled: false,
    });
  });

  it("turns a flag on at once when its rollout is below 100", async () => {
    await mount();
    await click(
      row("ai_chatgpt_plan").querySelector("[data-admin-flag-toggle]")!
    );
    expect(confirmButton()).toBeNull();
    expect(JSON.parse(String(patches()[0].init?.body))).toEqual({
      enabled: true,
    });
  });

  it("asks before a rollout of 100 but not before a smaller one", async () => {
    await mount();
    const input = row("habits_quit").querySelector<HTMLInputElement>("input")!;
    const save = row("habits_quit").querySelector<HTMLButtonElement>(
      "[data-admin-flag-rollout-save]"
    )!;
    expect(save.disabled).toBe(true);

    await type(input, "40");
    await click(save);
    expect(confirmButton()).toBeNull();
    expect(JSON.parse(String(patches()[0].init?.body))).toEqual({
      rolloutPercentage: 40,
    });

    await type(
      row("habits_quit").querySelector<HTMLInputElement>("input")!,
      "100"
    );
    await click(
      row("habits_quit").querySelector("[data-admin-flag-rollout-save]")!
    );
    expect(confirmButton()).not.toBeNull();
    expect(patches()).toHaveLength(1);
    await click(confirmButton()!);
    expect(JSON.parse(String(patches()[1].init?.body))).toEqual({
      rolloutPercentage: 100,
    });
  });

  it("adds an override by email, and shows overrides and history", async () => {
    await mount();
    await click(row("habits_quit").querySelector("[data-admin-flag-open]")!);
    const detail = host.querySelector("[data-admin-flag-detail]")!;
    expect(detail.textContent).toContain("ann@example.com");
    expect(detail.textContent).toContain("off · 0% → on · 25%");
    expect(detail.textContent).toContain("admin@needt.app");

    await type(
      detail.querySelector<HTMLInputElement>('input[type="email"]')!,
      "bo@example.com"
    );
    await click(detail.querySelector("[data-admin-override-add]")!);
    const sent = patches().find((c) =>
      String(c.init?.body).includes("bo@example.com")
    );
    expect(JSON.parse(String(sent?.init?.body))).toEqual({
      email: "bo@example.com",
      userEnabled: true,
    });
  });

  it("sets an override for the caller in one click", async () => {
    await mount();
    await click(row("habits_quit").querySelector("[data-admin-flag-open]")!);
    await click(host.querySelector("[data-admin-override-self]")!);
    expect(JSON.parse(String(patches()[0].init?.body))).toEqual({
      self: true,
      userEnabled: true,
    });
  });
});
