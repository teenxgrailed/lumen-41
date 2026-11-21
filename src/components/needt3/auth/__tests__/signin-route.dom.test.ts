/**
 * @jest-environment jsdom
 *
 * The sign-in route owns what must survive a re-render: the typed values, the
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

const mount = async (props: { startMode?: "signup" } = {}) => {
  await act(async () => {
    root.render(h(V3SignInRoute, { callbackUrl: "/calendar", ...props }));
  });
  /* The code form is the main path; these tests are about the password form,
     which sits behind "Use password". */
  await act(async () => {
    q<HTMLElement>("[data-auth-use-password]")?.click();
  });
};
const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

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

describe("a password sign-in", () => {
  it("a refused sign-in does not redirect", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    await mount();
    await fill("ana@x.ch", "12345678");
    await submitForm();
    expect(location.href).toBe(START);
    expect(host.textContent).toContain("That email and password do not match.");
  });

  it("an open recovery step stays open", async () => {
    await mount();
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-forgot]")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    type(q<HTMLInputElement>('input[type="email"]')!, "ana@x.ch");
    await act(async () => {
      q<HTMLElement>("[data-auth-submit]")!.click();
    });
    type(q<HTMLInputElement>('input[type="password"]')!, "12345678");
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-forgot]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(q('[data-auth-screen="recover-ask"]')).not.toBeNull();
  });
});

const tickAge = () =>
  act(async () => {
    q<HTMLInputElement>("[data-auth-age] input")!.click();
  });

/* Email first; the password field arrives under it once Continue is pressed. */
const fill = async (email: string, pass: string) => {
  type(q<HTMLInputElement>('input[type="email"]')!, email);
  await act(async () => {
    q<HTMLElement>("[data-auth-submit]")!.click();
  });
  type(q<HTMLInputElement>('input[type="password"]')!, pass);
};

/* The card has no <form>: the one primary button is the submit. */
const submitForm = () =>
  act(async () => {
    q<HTMLElement>("[data-auth-submit]")!.click();
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

  it("a new account goes on to the onboarding resolver", async () => {
    signup = { ok: true, body: { enabled: true } };
    signIn.mockResolvedValue({ ok: true });
    await mount();
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-switch]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    await fill("new@x.ch", "12345678");
    await tickAge();
    await submitForm();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ method: "POST" })
    );
    // The register mock says nothing about the flow: the resolver decides.
    expect(went).toBe("/api/onboarding/resume");
  });

  it("a new account is not created until the 16+ box is ticked", async () => {
    signup = { ok: true, body: { enabled: true } };
    signIn.mockResolvedValue({ ok: true });
    await mount();
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-switch]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(q("[data-auth-age]")).not.toBeNull();
    await fill("new@x.ch", "12345678");
    await submitForm();
    const registered = (globalThis.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === "/api/auth/register"
    );
    expect(registered).toHaveLength(0);
    expect(signIn).not.toHaveBeenCalled();
    expect(q("[data-auth-age]")?.getAttribute("data-missing")).toBe("true");

    await tickAge();
    await submitForm();
    const [, init] = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === "/api/auth/register"
    )!;
    expect(JSON.parse((init as { body: string }).body)).toMatchObject({
      email: "new@x.ch",
      ageConfirmed: true,
    });
  });

  it("sign-in itself never shows the box", async () => {
    await mount();
    expect(q("[data-auth-age]")).toBeNull();
  });

  it("a new account goes where the server says (onboarding_v3 on: /start)", async () => {
    // One fetch mock answers both the signup probe and the register call.
    signup = { ok: true, body: { enabled: true, next: "/start" } };
    signIn.mockResolvedValue({ ok: true });
    await mount();
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-switch]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    await fill("new@x.ch", "12345678");
    await tickAge();
    await submitForm();
    expect(went).toBe("/start");
  });

  it("ignores a next path that is not an onboarding entry", async () => {
    signup = {
      ok: true,
      body: { enabled: true, next: "https://evil.example" },
    };
    signIn.mockResolvedValue({ ok: true });
    await mount();
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-switch]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    await fill("new@x.ch", "12345678");
    await tickAge();
    await submitForm();
    expect(went).toBe("/api/onboarding/resume");
  });

  it("a returning person goes where they were going, never through setup", async () => {
    signIn.mockResolvedValue({ ok: true });
    await mount();
    await fill("ana@x.ch", "12345678");
    await submitForm();
    expect(went).toBe("/calendar");
  });
});

describe("opened from /auth/reset-password without a token", () => {
  it("starts on Forgot your password, and Back to sign in closes it", async () => {
    await act(async () => {
      root.render(
        h(V3SignInRoute, { callbackUrl: "/calendar", startRecover: true })
      );
    });
    expect(q('[data-auth-screen="recover-ask"]')).not.toBeNull();
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-back-signin]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(q('[data-auth-screen="login"]')).not.toBeNull();
  });
});

describe("the first mode", () => {
  it("opens on sign-in by default", async () => {
    signup = { ok: true, body: { enabled: true } };
    await mount();
    expect(q('[data-auth-screen="login"]')).not.toBeNull();
  });
  it("opens on create-account with ?mode=signup", async () => {
    signup = { ok: true, body: { enabled: true } };
    await mount({ startMode: "signup" });
    expect(q('[data-auth-screen="signup"]')).not.toBeNull();
    expect(q('[data-auth-screen="login"]')).toBeNull();
  });
});

describe("a refused password", () => {
  const refuse = async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    await mount();
    await fill("ana@x.ch", "12345678");
    await submitForm();
  };
  const codeRequests = () =>
    (fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === "/api/auth/email-code/request"
    );

  it("says the way out and sends a code to the same address", async () => {
    await refuse();
    // the same line for every refusal: it does not say which account it was
    expect(host.textContent).toContain("That email and password do not match.");
    expect(host.textContent).toContain("Signed up with Google or a code?");
    await act(async () => {
      q<HTMLButtonElement>("[data-auth-wrong-code]")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(codeRequests()).toHaveLength(1);
    expect(JSON.parse(codeRequests()[0][1].body)).toEqual({
      email: "ana@x.ch",
    });
    expect(q("[data-auth-code-step]")).not.toBeNull();
    expect(q('input[type="password"]')).toBeNull();
    expect(host.textContent).not.toContain("do not match");
  });

  it("shows the resend answer on the page, not in a toast", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { notify } = require("@/lib/notifications");
    await mount();
    type(q<HTMLInputElement>('input[type="email"]')!, "ana@x.ch");
    await act(async () => {
      q<HTMLElement>("[data-auth-submit]")!.click();
    });
    type(q<HTMLInputElement>('input[type="email"]')!, "");
    await act(async () => {
      for (const b of host.querySelectorAll<HTMLButtonElement>("button"))
        if (b.textContent === "Resend confirmation") b.click();
    });
    expect(host.textContent).toContain("Enter your email first.");
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });
});
