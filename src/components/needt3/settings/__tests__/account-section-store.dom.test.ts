/**
 * @jest-environment jsdom
 *
 * Settings → Account in a store build keeps "Delete account" (App Store
 * Review Guideline 5.1.1(v)); the store mode only removes purchase UI.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { AccountSection } from "../AccountSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { name: "Test Person", email: "t@example.com", image: null },
    },
  }),
  signOut: jest.fn(),
}));
jest.mock("@/lib/auth/client-sign-out", () => ({
  signOutOfNeedt: jest.fn(),
}));
jest.mock("@/lib/pwa/offline-client", () => ({
  clearNeedtOfflineData: jest.fn(),
}));
jest.mock("@/components/settings/AccountSettings", () => ({
  AccountSettings: () => null,
}));
jest.mock("@/lib/notifications", () => ({
  notify: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(() =>
    Promise.resolve({ ok: false })
  );
  host =document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { __needtNative?: unknown }).__needtNative;
});

it("store build: Delete account and Sign out stay reachable", () => {
  (window as unknown as { __needtNative?: unknown }).__needtNative = {
    platform: "mac-swift",
    distribution: "appstore",
  };
  act(() => root.render(h(AccountSection)));
  expect(host.textContent).toMatch(/Delete account/);
  expect(host.textContent).toMatch(/Sign out/);
});
