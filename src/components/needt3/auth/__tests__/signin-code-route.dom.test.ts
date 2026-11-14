/**
 * @jest-environment jsdom
 *
 * The sign-in route wired to the email-code provider: the request goes to
 * /api/auth/email-code/request, the code is traded through NextAuth's
 * "email-code" provider, and a brand-new account (the session says so, not
 * the page) goes to onboarding while a returning one goes where it was going.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { ONBOARDING_RESUME_PATH } from "@/lib/onboarding/paths";

import { V3SignInRoute } from "../SignInRoute";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const signIn = jest.fn();
const getSession = jest.fn();
jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("@/styles/v3-entry.css", () => ({}), { virtual: true });
jest.mock("next-auth/react", () => ({
  getProviders: async () => ({}),
  getSession: (...a: unknown[]) => getSession(...a),
  signIn: (...a: unknown[]) => signIn(...a),
}));
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
let requestStatus = 200;
const location = {
  href: "http://localhost/auth/signin",
  origin: "http://localhost",
  host: "localhost",
  protocol: "http:",
};

beforeEach(() => {
  jest.clearAllMocks();
  requestStatus = 200;
  location.href = "http://localhost/auth/signin";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
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
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string) => ({
    ok: url.includes("email-code") ? requestStatus < 400 : true,
    status: url.includes("email-code") ? requestStatus : 200,
    json: async () => ({ enabled: true }),
  }));
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
const type = (el: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const mount = () =>
  act(async () => {
    root.render(h(V3SignInRoute, { callbackUrl: "/calendar" }));
  });

async function sendAndEnterCode(code = "123456") {
  await type(
    q<HTMLInputElement>('input[aria-label="Email"]') as HTMLInputElement,
    "Person@Example.com"
  );
  await act(async () => {
    q<HTMLElement>("[data-auth-send-code]")?.click();
  });
  await type(
    q<HTMLInputElement>('input[aria-label="Code"]') as HTMLInputElement,
    code
  );
}

describe("sign in with a code", () => {
  it("asks the server for a code for the lower-cased address", async () => {
    await mount();
    await type(
      q<HTMLInputElement>('input[aria-label="Email"]') as HTMLInputElement,
      "Person@Example.com"
    );
    await act(async () => {
      q<HTMLElement>("[data-auth-send-code]")?.click();
    });
    const call = (fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).includes("/api/auth/email-code/request")
    );
    expect(call).toBeDefined();
    expect(JSON.parse(call[1].body)).toEqual({ email: "person@example.com" });
    expect(q("[data-auth-code-step]")).not.toBeNull();
  });

  it("a returning person goes where they were going", async () => {
    signIn.mockResolvedValue({ ok: true });
    getSession.mockResolvedValue({ newAccount: false });
    await mount();
    await sendAndEnterCode();
    expect(signIn).toHaveBeenCalledWith(
      "email-code",
      expect.objectContaining({
        email: "person@example.com",
        code: "123456",
        ageConfirmed: "false",
        redirect: false,
      })
    );
    expect(location.href).toBe("/calendar");
  });

  it("a new account (the session says so) goes to onboarding", async () => {
    signIn.mockResolvedValue({ ok: true });
    getSession.mockResolvedValue({ newAccount: true });
    await mount();
    await sendAndEnterCode();
    expect(location.href).toBe(ONBOARDING_RESUME_PATH);
  });

  it("a wrong code stays on the page", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    await mount();
    await sendAndEnterCode("000000");
    expect(location.href).toBe("http://localhost/auth/signin");
    expect(host.textContent).toContain("That code didn’t work");
  });

  it("a new address without the 16+ box switches to sign-up and keeps the code step", async () => {
    signIn.mockResolvedValue({ error: "AgeConfirmRequired" });
    await mount();
    await sendAndEnterCode();
    expect(q("[data-auth-screen='signup']")).not.toBeNull();
    expect(host.textContent).toContain("Tick the box");
    expect(location.href).toBe("http://localhost/auth/signin");
  });

  it("shows the rate-limit line when the request is refused with 429", async () => {
    requestStatus = 429;
    await mount();
    await type(
      q<HTMLInputElement>('input[aria-label="Email"]') as HTMLInputElement,
      "person@example.com"
    );
    await act(async () => {
      q<HTMLElement>("[data-auth-send-code]")?.click();
    });
    expect(host.textContent).toContain("Too many requests");
  });
});
