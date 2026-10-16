/**
 * @jest-environment jsdom
 *
 * Promo codes (admin): the list, generate-a-code, create, deactivate behind a
 * confirmation, and the redemptions of a code.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import { PromoScreen } from "../PromoScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const codes = [
  {
    id: "p1",
    code: "HELLO-30",
    kind: "pro_days",
    value: 30,
    maxRedemptions: 5,
    redeemedCount: 2,
    expiresAt: null,
    active: true,
    createdAt: "2026-10-16T00:00:00.000Z",
  },
  {
    id: "p2",
    code: "OLD-ONE",
    kind: "lifetime",
    value: null,
    maxRedemptions: null,
    redeemedCount: 0,
    expiresAt: null,
    active: false,
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

let host: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body: unknown }>;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const body = url.endsWith("/generate")
      ? { code: "K7M2P-9XQ4R" }
      : url.endsWith("/redemptions")
        ? {
            redemptions: [
              {
                id: "r1",
                userId: "u1",
                email: "pat@example.com",
                createdAt: "2026-10-16T09:30:00.000Z",
              },
            ],
          }
        : method === "POST"
          ? { code: codes[0] }
          : method === "PATCH"
            ? { code: { ...codes[0], active: false } }
            : { codes };
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  await act(async () => {
    root.render(h(V3PortalScope, null, h(PromoScreen)));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function click(el: Element | null) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function type(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("PromoScreen", () => {
  it("lists codes with what they give, use and status", () => {
    const row = host.querySelector('[data-admin-code="HELLO-30"]')!;
    expect(row.textContent).toContain("30 days of Pro");
    expect(row.textContent).toContain("2 / 5");
    expect(row.textContent).toContain("Active");
    expect(
      host.querySelector('[data-admin-code="OLD-ONE"]')?.textContent
    ).toContain("Off");
    // A switched-off code has no Deactivate button.
    expect(
      host.querySelector('[data-admin-code="OLD-ONE"] [data-admin-deactivate]')
    ).toBeNull();
  });

  it("fills the field from the generate button", async () => {
    await click(host.querySelector("[data-admin-generate]"));
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="Code"]')!.value
    ).toBe("K7M2P-9XQ4R");
  });

  it("creates a code with its days", async () => {
    await type('input[aria-label="Code"]', "spring-14");
    await click(host.querySelector("[data-admin-create]"));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/admin/promo-codes");
    expect(post.body).toEqual({
      code: "spring-14",
      kind: "trial_days",
      value: 14,
      maxRedemptions: null,
      expiresAt: null,
    });
  });

  it("asks before it deactivates a code", async () => {
    await click(
      host.querySelector('[data-admin-code="HELLO-30"] [data-admin-deactivate]')
    );
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(document.body.textContent).toContain("HELLO-30 stops working");
    await click(document.querySelector("[data-admin-confirm]"));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/admin/promo-codes/p1");
    expect(patch.body).toEqual({ active: false });
  });

  it("shows who used a code", async () => {
    await click(
      host.querySelector(
        '[data-admin-code="HELLO-30"] [data-admin-redemptions-toggle]'
      )
    );
    expect(
      host.querySelector("[data-admin-redemptions]")?.textContent
    ).toContain("pat@example.com");
  });
});
