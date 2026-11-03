/**
 * @jest-environment jsdom
 *
 * WKWebView (the iOS and Mac apps) has `serviceWorker` in navigator but leaves
 * it undefined outside app-bound domains. Mounting PWARegister there must not
 * throw: before this guard the root layout crashed into global-error on every
 * load in the iOS app.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PWARegister } from "../PWARegister";

jest.mock("lucide-react", () => ({ WifiOff: () => null }));
jest.mock("@/components/providers/app-session-context", () => ({
  useAppSession: () => ({
    data: { user: { id: "user-1" } },
    status: "authenticated",
  }),
}));
jest.mock("@/components/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({ activeWorkspace: { workspace: { id: "ws-1" } } }),
}));
jest.mock("@/lib/pwa/offline-client", () => ({
  clearIfSignedOut: jest.fn(),
  clearNeedtOfflineData: jest.fn(),
  setNeedtOfflineScope: jest.fn().mockResolvedValue(undefined),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
  // The WebView shape: the key exists, the value does not.
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: undefined,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("mounts without a service worker container", async () => {
  expect("serviceWorker" in navigator).toBe(true);
  await expect(
    act(async () => {
      root.render(h(PWARegister));
    })
  ).resolves.not.toThrow();
  await act(async () => {
    root.unmount();
    root = createRoot(host);
  });
});
