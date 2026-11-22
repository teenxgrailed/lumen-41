/**
 * @jest-environment jsdom
 *
 * A service worker taking over is a new version only when it was registered
 * for a different build than the page's own.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { NEW_VERSION_EVENT } from "@/lib/pwa/build-version";

import { PWARegister } from "../PWARegister";

jest.mock("lucide-react", () => ({ WifiOff: () => null }));
jest.mock("@/components/providers/app-session-context", () => ({
  useAppSession: () => ({ data: null, status: "unauthenticated" }),
}));
jest.mock("@/components/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({ activeWorkspace: null }),
}));
jest.mock("@/lib/pwa/offline-client", () => ({
  clearIfSignedOut: jest.fn(),
  clearNeedtOfflineData: jest.fn(),
  setNeedtOfflineScope: jest.fn().mockResolvedValue(undefined),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const A = "a".repeat(40);
const B = "b".repeat(40);

let host: HTMLDivElement;
let root: Root;
let onChange: (() => void) | null;
let controller: { scriptURL: string; postMessage: jest.Mock } | null;
const reload = jest.fn();

beforeEach(() => {
  process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA = A;
  onChange = null;
  controller = {
    scriptURL: `https://x.test/sw.js?v=${A}`,
    postMessage: jest.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      get controller() {
        return controller;
      },
      register: jest.fn().mockResolvedValue({ update: jest.fn() }),
      getRegistrations: jest.fn().mockResolvedValue([]),
      addEventListener: (type: string, fn: () => void) => {
        if (type === "controllerchange") onChange = fn;
      },
      removeEventListener: jest.fn(),
    },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA;
});

async function mount() {
  await act(async () => {
    root.render(h(PWARegister));
  });
}

describe("service worker controllerchange", () => {
  it("does not ask for a reload when the worker is for the page's own build", async () => {
    const seen = jest.fn();
    window.addEventListener(NEW_VERSION_EVENT, seen);
    await mount();
    expect(onChange).not.toBeNull();
    onChange!();
    expect(seen).not.toHaveBeenCalled();
    window.removeEventListener(NEW_VERSION_EVENT, seen);
  });

  it("asks for one when the worker is for a different build", async () => {
    const seen = jest.fn();
    window.addEventListener(NEW_VERSION_EVENT, seen);
    await mount();
    controller = {
      scriptURL: `https://x.test/sw.js?v=${B}`,
      postMessage: jest.fn(),
    };
    onChange!();
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(NEW_VERSION_EVENT, seen);
    expect(reload).not.toHaveBeenCalled();
  });
});
