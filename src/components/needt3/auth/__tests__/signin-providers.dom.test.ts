/**
 * @jest-environment jsdom
 *
 * The sign-in screen's provider buttons, on both faces (owner decision
 * 2026-10-12): Google, Apple and GitHub show; "More ways to sign in" reveals
 * the rest; a provider the server did not report is never drawn.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3SignInRoute, configuredSignInProviders } from "../SignInRoute";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let available: Record<string, unknown> = {};
const signIn = jest.fn();
jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("@/styles/v3-entry.css", () => ({}), { virtual: true });
jest.mock("next-auth/react", () => ({
  getProviders: async () => available,
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

const ALL = [
  "credentials",
  "google",
  "apple",
  "github",
  "azure-ad",
  "openai",
  "discord",
  "twitter",
  "linkedin",
];
const reported = (ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, { id, name: id }]));

let host: HTMLDivElement;
let root: Root;
let narrow = false;

beforeEach(() => {
  jest.clearAllMocks();
  available = reported(ALL);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width") ? narrow : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
    ok: true,
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

const mount = () =>
  act(async () => {
    root.render(h(V3SignInRoute, { callbackUrl: "/calendar" }));
  });
const shown = () =>
  Array.from(host.querySelectorAll("[data-provider]")).map((el) =>
    el.getAttribute("data-provider")
  );
const moreWays = () =>
  Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === "More ways to sign in"
  );

describe.each([
  ["desktop", false],
  ["phone", true],
])("the %s face", (_face, isNarrow) => {
  beforeEach(() => {
    narrow = isNarrow;
  });

  it("shows Google, Apple and GitHub, then More ways for the rest", async () => {
    await mount();
    expect(shown()).toEqual(["google", "apple", "github"]);
    expect(moreWays()).toBeDefined();

    await act(async () => {
      moreWays()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(shown()).toEqual([
      "google",
      "apple",
      "github",
      "azure-ad",
      "openai",
      "discord",
      "twitter",
      "linkedin",
    ]);
    expect(moreWays()).toBeUndefined();
    expect(host.textContent).toContain("Sign in with Apple");
    expect(host.textContent).toContain("Sign in with ChatGPT");
    expect(host.textContent).toContain("Sign in with Microsoft");
  });

  it("draws only what the server reports, and no More ways without extras", async () => {
    available = reported(["credentials", "google", "github"]);
    await mount();
    expect(shown()).toEqual(["google", "github"]);
    expect(moreWays()).toBeUndefined();
  });

  it("starts the provider's sign-in on a click", async () => {
    signIn.mockResolvedValue(undefined);
    await mount();
    await act(async () => {
      host
        .querySelector('[data-provider="github"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(signIn).toHaveBeenCalledWith("github", {
      callbackUrl: "/calendar",
    });
  });
});

describe("configuredSignInProviders", () => {
  it("keeps our order and drops ids we do not know", () => {
    expect(
      configuredSignInProviders(
        reported(["linkedin", "credentials", "google", "nope"])
      ).map((p) => p.id)
    ).toEqual(["google", "linkedin"]);
    expect(configuredSignInProviders(null)).toEqual([]);
  });
});
