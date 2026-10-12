/**
 * @jest-environment jsdom
 *
 * The sign-in route owns what must survive a face swap: the typed values, the
 * redirect after a good sign-in (even when the screen that sent the request
 * has been replaced meanwhile), and the sign-up switch, where an error is
 * "unknown" and never "closed".
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3SignInRoute } from "../SignInRoute";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const signIn = jest.fn();
jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("@/styles/v3-entry.css", () => ({}), { virtual: true });
jest.mock("next-auth/react", () => ({
  getProviders: async () => ({}),
  signIn: (...a: unknown[]) => signIn(...a),
}));
// the picker pulls the icon set, which jest cannot parse (ESM); icons are not under test
jest.mock(
  "lucide-react",
  () =>
    new Proxy(
      { __esModule: true },
      { get: (t, k) => (k in t ? (t as never)[k] : () => null) }
    )
);
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

let host: HTMLDivElement;
let root: Root;
let narrowListeners: ((e: { matches: boolean }) => void)[] = [];
let signup: { ok: boolean; body?: unknown } | "throw" = {
  ok: true,
  body: { enabled: false },
};
const START = "http://localhost/auth/signin";
const location = {
  href: START,
  origin: "http://localhost",
  host: "localhost",
  protocol: "http:",
};

beforeEach(() => {
  jest.clearAllMocks();
  narrowListeners = [];
  location.href = START;
  signup = { ok: true, body: { enabled: false } };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width") ? true : false,
      media: query,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
        if (query.includes("max-width")) narrowListeners.push(fn);
      },
      removeEventListener() {},
    }),
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: location,
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => {
    const answer = signup;
    if (answer === "throw") throw new Error("offline");
    return { ok: answer.ok, json: async () => answer.body };
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

const mount = () =>
  act(async () => {
    root.render(h(V3SignInRoute, { callbackUrl: "/calendar" }));
  });
const swap = (narrow: boolean) =>
  act(() => {
    narrowListeners.forEach((fn) => fn({ matches: narrow }));
  });
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const face = () =>
  q("[data-auth-screen]")?.closest(".mau-scene") ? "phone" : "desktop";

describe("the sign-up switch", () => {
  it("closed: the waitlist line", async () => {
    await mount();
    expect(q("[data-auth-waitlist]")).not.toBeNull();
    expect(q("[data-auth-switch]")).toBeNull();
  });
  it("open: Create one", async () => {
    signup = { ok: true, body: { enabled: true } };
    await mount();
    expect(q("[data-auth-waitlist]")).toBeNull();
    expect(q("[data-auth-switch]")).not.toBeNull();
  });
  it.each([
    ["a server error", { ok: false, body: { enabled: false } }],
    ["a network error", "throw"],
    ["an unreadable answer", { ok: true, body: {} }],
  ] as const)("%s is unknown: neither is shown", async (_n, answer) => {
    signup = answer as typeof signup;
    await mount();
    expect(q("[data-auth-waitlist]")).toBeNull();
    expect(q("[data-auth-switch]")).toBeNull();
  });
});

describe("crossing 700px", () => {
  it("keeps the typed address and password", async () => {
    await mount();
    expect(face()).toBe("phone");
    type(q<HTMLInputElement>('input[aria-label="Email"]')!, "ana@x.ch");
    type(q<HTMLInputElement>('input[aria-label="Password"]')!, "12345678");
    await swap(false);
    expect(face()).toBe("desktop");
    expect(q<HTMLInputElement>('input[aria-label="Email"]')!.value).toBe(
      "ana@x.ch"
    );
    expect(q<HTMLInputElement>('input[aria-label="Password"]')!.value).toBe(
      "12345678"
    );
  });

  it("keeps the open recovery step and the server's last refusal", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    await mount();
    // a refusal on the phone face is still on screen after the swap
    type(q<HTMLInputElement>('input[type="email"]')!, "ana@x.ch");
    type(q<HTMLInputElement>('input[type="password"]')!, "12345678");
    await act(async () => {
      q<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(host.textContent).toContain("That email and password do not match.");
    await swap(false);
    expect(face()).toBe("desktop");
    expect(host.textContent).toContain("That email and password do not match.");
    // an open "Forgot password?" survives the way back
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-forgot]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(q('[data-auth-screen="recover-ask"]')).not.toBeNull();
    await swap(true);
    expect(face()).toBe("phone");
    expect(q('[data-auth-screen="recover-ask"]')).not.toBeNull();
  });

  it("a sign-in that finishes after the swap still redirects, once", async () => {
    let resolve!: (v: unknown) => void;
    signIn.mockReturnValue(new Promise((r) => (resolve = r)));
    await mount();
    type(q<HTMLInputElement>('input[type="email"]')!, "ana@x.ch");
    type(q<HTMLInputElement>('input[type="password"]')!, "12345678");
    await act(async () => {
      q<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    await swap(false);
    await act(async () => resolve({ ok: true }));
    expect(location.href).toBe("/calendar");
  });

  it("a refused sign-in does not redirect", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    await mount();
    type(q<HTMLInputElement>('input[type="email"]')!, "ana@x.ch");
    type(q<HTMLInputElement>('input[type="password"]')!, "12345678");
    await act(async () => {
      q<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(location.href).toBe(START);
  });
});

const submitForm = () =>
  act(async () => {
    q<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });

describe("where a sign-in lands", () => {
  /* The page keeps rendering after the redirect is set (next/image reads
     `location.href` as a base URL), so record the target and keep the
     current address absolute. */
  let went: string | null = null;
  beforeEach(() => {
    went = null;
    Object.defineProperty(location, "href", {
      configurable: true,
      get: () => START,
      set: (value: string) => {
        went = value;
      },
    });
  });
  afterEach(() => {
    Object.defineProperty(location, "href", {
      configurable: true,
      writable: true,
      value: START,
    });
  });

  it("a new account goes on to first-run setup (the onboarding)", async () => {
    signup = { ok: true, body: { enabled: true } };
    signIn.mockResolvedValue({ ok: true });
    await mount();
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-switch]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    type(q<HTMLInputElement>('input[type="email"]')!, "new@x.ch");
    type(q<HTMLInputElement>('input[type="password"]')!, "12345678");
    await submitForm();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ method: "POST" })
    );
    expect(went).toBe("/setup");
  });

  it("a returning person goes where they were going, never through setup", async () => {
    signIn.mockResolvedValue({ ok: true });
    await mount();
    type(q<HTMLInputElement>('input[type="email"]')!, "ana@x.ch");
    type(q<HTMLInputElement>('input[type="password"]')!, "12345678");
    await submitForm();
    expect(went).toBe("/calendar");
  });
});
