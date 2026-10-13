/**
 * @jest-environment jsdom
 *
 * The email-confirmation banner is fixed at the top. It publishes its height
 * so the design_v3 frame starts below it: no screen header sits under it.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import {
  EmailVerificationGate,
  TOP_BANNER_VAR,
} from "@/components/auth/EmailVerificationGate";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));

let host: HTMLDivElement;
let root: Root;
const banner = () => host.querySelector<HTMLElement>("[data-top-banner]");
const published = () =>
  document.documentElement.style.getPropertyValue(TOP_BANNER_VAR);

beforeEach(() => {
  // jsdom has no layout: the banner is 45 px tall, as measured on a phone.
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ height: 45 } as DOMRect);
  global.fetch = jest.fn(() => new Promise(() => {})) as never;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

function render(verified: boolean) {
  act(() =>
    root.render(
      h(EmailVerificationGate, {
        initialStatus: {
          email: "dev@needt.local",
          verified,
          required: false,
        },
        children: h("main", null, "app"),
      })
    )
  );
}

describe("top banner height", () => {
  it("is published while the banner shows", () => {
    render(false);
    expect(banner()).not.toBeNull();
    expect(published()).toBe("45px");
  });

  it("is cleared when there is no banner", () => {
    render(true);
    expect(banner()).toBeNull();
    expect(published()).toBe("");
  });

  it("is cleared when the banner goes away", () => {
    render(false);
    expect(published()).toBe("45px");
    act(() => root.unmount());
    root = createRoot(host);
    expect(published()).toBe("");
  });
});
