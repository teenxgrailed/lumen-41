/**
 * @jest-environment jsdom
 *
 * The e2e stub answers every /api/* with `[]` (tests/mobile-navigation.spec.ts).
 * Home, flag off, must survive that on both faces: an array where an object is
 * expected must never reach a throw.
 */
import { type FunctionComponent, act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { HomeScreen } from "../../../home/HomeScreen";
import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { HomeFaces } from "../HomeFaces";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/today",
}));
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../../orb/AiOrb", () => ({ AiOrb: () => null }));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let root: Root;
let host: HTMLElement;
let client: QueryClient;
let errors: jest.SpyInstance;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => [],
    text: async () => "[]",
  }));
  errors = jest.spyOn(console, "error").mockImplementation(() => {});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { fetch?: unknown }).fetch;
  act(() => root.unmount());
  host.remove();
  client.clear();
});

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

const run = async (screen: FunctionComponent, ui: "phone" | "desktop") => {
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(PhoneUiProvider, { value: ui }, h(screen))
      )
    );
  });
  await settle();
};

const PhoneOff = () =>
  h(HomeFaces, {
    v2: false,
    desktop: () => h("div", { "data-desktop": "" }),
  });
const DesktopOff = () => h(HomeScreen, { v2: false });

describe("Home with every /api/* answering []", () => {
  it("phone, v2 off: renders without a throw", async () => {
    await run(PhoneOff, "phone");
    const thrown = errors.mock.calls
      .map((c) => String(c[0]) + String(c[1] ?? ""))
      .filter((m) => /TypeError|Cannot read|is not a function|Error:/.test(m));
    expect(thrown).toEqual([]);
    expect(host.innerHTML.length).toBeGreaterThan(0);
  });

  it("desktop, v2 off: renders without a throw", async () => {
    await run(DesktopOff, "desktop");
    const thrown = errors.mock.calls
      .map((c) => String(c[0]) + String(c[1] ?? ""))
      .filter((m) => /TypeError|Cannot read|is not a function|Error:/.test(m));
    expect(thrown).toEqual([]);
    expect(host.innerHTML.length).toBeGreaterThan(0);
  });
});
