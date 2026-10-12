/**
 * @jest-environment jsdom
 *
 * The /calendar route's real component (CalendarCraft) under the frame's
 * phone-ui context, with a fake network: the phone face is the one drawn (not
 * the desktop week grid), and its skeleton gives way to the day once the
 * requests resolve.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { CalendarCraft } from "../../../calendar/CalendarCraft";
import { PhoneUiProvider } from "../../../root/phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// the frame's flag context lives in V3Root, which imports the CSS entry
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calendar",
}));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let release: () => void;
const gate = () =>
  new Promise<void>((r) => {
    release = r;
  });

const json = (body: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
});
const routes: Record<string, unknown> = {
  "/api/tasks": [],
  "/api/events": [],
  "/api/feeds": [],
  "/api/projects": [],
  "/api/user-settings": { timeZone: "UTC", weekStartDay: "monday" },
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  const open = gate();
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string) => {
    await open; // the network answers when the test says so
    const path = String(url).split("?")[0];
    return json(routes[path] ?? []);
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  client.clear();
  delete (globalThis as { fetch?: unknown }).fetch;
});

const mount = (ui: "phone" | "desktop") =>
  act(() =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(PhoneUiProvider, { value: ui }, h(CalendarCraft))
      )
    )
  );
const settle = () =>
  act(async () => {
    release();
    await new Promise((r) => setTimeout(r, 20));
  });

describe("/calendar on the phone", () => {
  it("draws the phone calendar, with a skeleton until the data is in", async () => {
    mount("phone");
    expect(host.querySelector("[data-pk-screen=calendar]")).not.toBeNull();
    expect(host.querySelector(".c2-stack")).toBeNull(); // not the week grid
    expect(host.querySelector("[data-p5-state=loading]")).not.toBeNull();
    // the phone's skeleton is rows, not the desktop's seven-column week grid
    expect(host.querySelector(".st-sk-week")).toBeNull();
    await settle();
    expect(host.querySelector("[data-p5-state]")).toBeNull();
    expect(host.querySelector(".v2p-week")).not.toBeNull();
    expect(host.textContent).toContain("Nothing planned");
  });

  it("the desktop width draws the desktop calendar", async () => {
    mount("desktop");
    expect(host.querySelector(".c2-stack")).not.toBeNull();
    expect(host.querySelector("[data-pk-screen=calendar]")).toBeNull();
    await settle();
  });
});
