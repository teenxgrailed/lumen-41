/**
 * @jest-environment jsdom
 *
 * Settings → Account (desktop): "Sign out of all devices" asks first, then
 * POSTs /api/account/sessions/revoke and signs out through signOutOfNeedt —
 * the old AccountSettings behaviour (PR #118). A failure is said and the
 * person stays signed in.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { AccountSection } from "../AccountSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockSignOutAll = jest.fn();
const mockNotify = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Maksym K", email: "m@needt.app", image: null } },
  }),
  signOut: jest.fn(),
}));
jest.mock("@/lib/auth/client-sign-out", () => ({
  signOutOfNeedt: (...a: unknown[]) => mockSignOutAll(...a),
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

beforeEach(() => {
  mockSignOutAll.mockReset();
  mockSignOutAll.mockResolvedValue(undefined);
  mockNotify.mockClear();
  fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const revokes = () =>
  fetchMock.mock.calls.filter((c) => c[0] === "/api/account/sessions/revoke");
const q = (sel: string) => host.querySelector<HTMLElement>(sel);
const click = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
const mount = () =>
  act(async () => {
    root.render(h(AccountSection));
  });

it("draws the row; the first click only asks", async () => {
  await mount();
  expect(host.textContent).toContain("Sign out of all devices");
  await click(q("[data-settings-signout-all]"));
  expect(revokes()).toHaveLength(0);
  expect(host.textContent).toContain("this one too");
  // Cancel goes back without a request
  const cancel = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === "Cancel"
  );
  await click(cancel ?? null);
  expect(q("[data-settings-signout-all-confirm]")).toBeNull();
  expect(revokes()).toHaveLength(0);
});

it("confirm revokes every session, then signs out", async () => {
  await mount();
  await click(q("[data-settings-signout-all]"));
  await click(q("[data-settings-signout-all-confirm]"));
  expect(revokes()).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/account/sessions/revoke", {
    method: "POST",
  });
  expect(mockSignOutAll).toHaveBeenCalledTimes(1);
});

it("a failed revoke tells the person and does not sign out", async () => {
  fetchMock.mockImplementation(() => Promise.resolve({ ok: false }));
  await mount();
  await click(q("[data-settings-signout-all]"));
  await click(q("[data-settings-signout-all-confirm]"));
  expect(mockSignOutAll).not.toHaveBeenCalled();
  expect(mockNotify).toHaveBeenCalledWith(
    "error",
    "Could not sign out of all devices"
  );
});
