/**
 * @jest-environment jsdom
 *
 * Settings → Account (desktop): the Sign-in methods card lists what
 * `/api/account/lifecycle` says is linked (password first), Devices names this
 * device and holds the sign-out-everywhere row, and the password row mails the
 * existing reset link. Nothing here writes a method.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { AccountSection } from "../AccountSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockNotify = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { name: "Maksym K", email: "m@needt.app", image: null },
      expires: "2026-11-13T10:00:00.000Z",
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
  notify: {
    info: (...a: unknown[]) => mockNotify("info", ...a),
    success: (...a: unknown[]) => mockNotify("success", ...a),
    error: (...a: unknown[]) => mockNotify("error", ...a),
    warning: (...a: unknown[]) => mockNotify("warning", ...a),
  },
}));

let host: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;

const lifecycle = (providers: string[]) =>
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      url === "/api/account/lifecycle"
        ? { ok: true, json: async () => ({ providers, deletion: null }) }
        : { ok: true }
    )
  );

beforeEach(() => {
  mockNotify.mockClear();
  fetchMock = jest.fn(() => Promise.resolve({ ok: false }));
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const mount = async () => {
  await act(async () => {
    root.render(h(AccountSection));
  });
  await settle();
};

it("lists the linked sign-in methods, the password first", async () => {
  lifecycle(["github", "credentials", "google"]);
  await mount();
  const text = host.textContent ?? "";
  expect(text).toContain("Sign-in methods");
  expect(text.indexOf("Password")).toBeGreaterThan(-1);
  expect(text.indexOf("Password")).toBeLessThan(text.indexOf("Google"));
  expect(text.indexOf("Google")).toBeLessThan(text.indexOf("GitHub"));
  expect(text).not.toContain("Apple");
});

it("draws no sign-in methods card when the read failed", async () => {
  await mount();
  expect(host.textContent).not.toContain("Sign-in methods");
});

it("Devices names this device and holds the sign-out-everywhere row", async () => {
  await mount();
  const text = host.textContent ?? "";
  expect(text).toContain("Devices");
  expect(text).toContain("This device");
  expect(text).toContain("active now");
  expect(text.indexOf("Devices")).toBeLessThan(
    text.indexOf("Sign out of all devices")
  );
});

it("the password row mails the reset link to the session email", async () => {
  lifecycle(["credentials"]);
  await mount();
  const btn = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === "Change by email"
  );
  expect(btn).toBeDefined();
  await act(async () => {
    btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/auth/reset-password/request",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "m@needt.app" }),
    })
  );
  expect(mockNotify).toHaveBeenCalledWith(
    "success",
    "We sent a link to m@needt.app."
  );
});
