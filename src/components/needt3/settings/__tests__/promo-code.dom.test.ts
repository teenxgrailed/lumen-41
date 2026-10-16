/**
 * @jest-environment jsdom
 *
 * "Have a code?" on the desktop Plan section and the phone Plan page: one
 * field and one button, the server's sentence shown on a refusal, the plan
 * refreshed and a notice raised on success.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { notify } from "@/lib/notifications";

import { PromoCodeCard } from "../../phone/settings/PromoCodeCard";
import { PromoCodeRow } from "../PromoCodeRow";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => null,
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let calls: Array<{ url: string; body: unknown }>;

beforeEach(() => {
  jest.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient();
  calls = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function answer(status: number, body: unknown) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "null")) });
    return { ok: status === 200, status, json: async () => body };
  }) as unknown as typeof fetch;
}

async function mount(face: typeof PromoCodeRow) {
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(face)));
  });
}

async function type(value: string) {
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="Promo code"]'
  )!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function apply() {
  const button = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Apply"
  )!;
  await act(async () => {
    button.click();
  });
}

describe.each([
  ["desktop Plan section", PromoCodeRow],
  ["phone Plan page", PromoCodeCard],
] as const)("%s", (_name, face) => {
  it("keeps Apply off until something is typed", async () => {
    await mount(face);
    const button = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Apply"
    )!;
    expect(button.disabled).toBe(true);
    await type("hello-30");
    expect(button.disabled).toBe(false);
  });

  it("posts the code, refreshes the plan and says what it did", async () => {
    answer(200, { kind: "pro_days", message: "Pro for 30 days added." });
    const spy = jest.spyOn(client, "invalidateQueries");
    await mount(face);
    await type("hello-30");
    await apply();
    expect(calls).toEqual([
      { url: "/api/promo/redeem", body: { code: "hello-30" } },
    ]);
    expect(spy).toHaveBeenCalled();
    expect(notify.success).toHaveBeenCalledWith("Pro for 30 days added.");
    expect(host.querySelector('input[aria-label="Promo code"]')).toHaveProperty(
      "value",
      ""
    );
  });

  it("shows the server's sentence when the code is refused", async () => {
    answer(409, {
      error: "You have already used that code.",
      code: "ALREADY_USED",
    });
    await mount(face);
    await type("hello-30");
    await apply();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "You have already used that code."
    );
    expect(notify.success).not.toHaveBeenCalled();
  });
});
