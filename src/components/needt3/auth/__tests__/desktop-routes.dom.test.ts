/**
 * @jest-environment jsdom
 *
 * The two pages that carry a browser sign-in into the desktop app: "Open
 * Needt" (/auth/desktop, in the system browser) and "Signing you in"
 * (/auth/desktop-complete, in the app). What is asserted is what each page
 * sends, where it goes, and that nothing happens on load.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3DesktopCompleteRoute } from "../DesktopCompleteRoute";
import { V3DesktopHandoffRoute } from "../DesktopHandoffRoute";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("@/styles/v3-entry.css", () => ({}), { virtual: true });
jest.mock(
  "lucide-react",
  () =>
    new Proxy(
      { __esModule: true },
      { get: (t, k) => (k in t ? (t as never)[k] : () => null) }
    )
);
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const CHALLENGE = "a".repeat(43);
const CODE = "c".repeat(43);
const VERIFIER = "v".repeat(43);

type Answer = { status: number; body?: unknown } | "throw";
let answer: Answer = { status: 404 };
const fetchMock = jest.fn<
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>,
  [string, RequestInit?]
>(async () => {
  const current = answer;
  if (current === "throw") throw new Error("offline");
  return {
    ok: current.status >= 200 && current.status < 300,
    status: current.status,
    json: async () => current.body ?? {},
  };
});
const assign = jest.fn();
const replace = jest.fn();

let host: HTMLDivElement;
let root: Root;

function mockLocation(hash = "") {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      href: `http://localhost/auth/desktop-complete${hash}`,
      origin: "http://localhost",
      host: "localhost",
      protocol: "http:",
      pathname: "/auth/desktop-complete",
      hash,
      assign,
      replace,
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  answer = { status: 404 };
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  mockLocation();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const screen = () => q("[data-auth-screen]")?.getAttribute("data-auth-screen");
const click = (sel: string) =>
  act(async () => {
    q<HTMLElement>(sel)!.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
  });

describe.each(["desktop", "phone"] as const)("on the %s face", (ui) => {
  const mountHandoff = (challenge = CHALLENGE) =>
    act(async () => {
      root.render(
        h(V3DesktopHandoffRoute, {
          email: "ana@x.ch",
          challenge,
          initialUi: ui,
          uiForced: true,
        })
      );
    });
  const mountComplete = () =>
    act(async () => {
      root.render(h(V3DesktopCompleteRoute, { initialUi: ui, uiForced: true }));
    });

  describe("Open Needt (browser)", () => {
    it("names the account and spends nothing on load", async () => {
      await mountHandoff();
      expect(screen()).toBe("desktop-ready");
      expect(host.textContent).toContain("ana@x.ch");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
    });

    it("a press posts the challenge with the handoff header, then opens needt://", async () => {
      answer = { status: 200, body: { code: CODE } };
      await mountHandoff();
      await click("[data-auth-desktop-open]");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/auth/desktop/code");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["x-needt-desktop"]).toBe(
        "1"
      );
      expect(init?.body).toBe(JSON.stringify({ challenge: CHALLENGE }));
      expect(assign).toHaveBeenCalledWith(`needt://auth?code=${CODE}`);
      expect(screen()).toBe("desktop-sent");
    });

    it("never opens a link for a malformed code", async () => {
      answer = { status: 200, body: { code: "x&next=https://evil.example" } };
      await mountHandoff();
      await click("[data-auth-desktop-open]");
      expect(assign).not.toHaveBeenCalled();
      expect(screen()).toBe("desktop-error");
    });

    it("says so when the server refuses, and offers another try", async () => {
      answer = { status: 429 };
      await mountHandoff();
      await click("[data-auth-desktop-open]");
      expect(assign).not.toHaveBeenCalled();
      expect(screen()).toBe("desktop-error");
      expect(q('[role="alert"]')?.textContent).toContain("Couldn’t");
      expect(q("[data-auth-desktop-retry]")).not.toBeNull();
    });

    it("a link without a valid challenge is a dead end", async () => {
      await mountHandoff("short");
      expect(screen()).toBe("desktop-invalid");
      expect(q("[data-auth-desktop-open]")).toBeNull();
    });
  });

  describe("Signing you in (app)", () => {
    it("trades the fragment for a session and goes to Today", async () => {
      mockLocation(`#code=${CODE}&verifier=${VERIFIER}`);
      answer = { status: 200, body: { ok: true } };
      await mountComplete();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/auth/desktop/exchange");
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("same-origin");
      expect((init?.headers as Record<string, string>)["x-needt-desktop"]).toBe(
        "1"
      );
      expect(init?.body).toBe(
        JSON.stringify({ code: CODE, verifier: VERIFIER })
      );
      expect(replace).toHaveBeenCalledWith("/today");
    });

    it("takes the secrets out of the address bar", async () => {
      mockLocation(`#code=${CODE}&verifier=${VERIFIER}`);
      const replaceState = jest.spyOn(window.history, "replaceState");
      answer = { status: 200 };
      await mountComplete();
      expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/auth/desktop-complete"
      );
    });

    it("a refused code says it expired and offers to start again", async () => {
      mockLocation(`#code=${CODE}&verifier=${VERIFIER}`);
      answer = { status: 401 };
      await mountComplete();
      expect(replace).not.toHaveBeenCalled();
      expect(screen()).toBe("desktop-complete-failed");
      await click("[data-auth-desktop-restart]");
      expect(assign).toHaveBeenCalledWith("needt://start-sign-in");
    });

    it("a network failure is the same dead end, not a crash", async () => {
      mockLocation(`#code=${CODE}&verifier=${VERIFIER}`);
      answer = "throw";
      await mountComplete();
      expect(screen()).toBe("desktop-complete-failed");
    });

    it("opened in a plain browser (no fragment) sends nothing", async () => {
      await mountComplete();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen()).toBe("desktop-complete-invalid");
    });
  });
});
