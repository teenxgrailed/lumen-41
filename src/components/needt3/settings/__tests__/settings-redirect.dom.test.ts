/**
 * @jest-environment jsdom
 *
 * `/settings?section=billing&checkout=…` with design_v3 on: the sheet opens on
 * Plan, the checkout starts once, and the param is gone from the address.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { startCheckout } from "@/lib/needt3/hooks/account";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { SettingsRedirect } from "../SettingsRedirect";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));
jest.mock("@/lib/needt3/hooks/account", () => ({
  startCheckout: jest.fn(),
}));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));

const checkout = jest.mocked(startCheckout);

let host: HTMLDivElement;
let root: Root;

async function open(url: string) {
  window.history.replaceState({}, "", url);
  await act(async () => {
    root.render(h(SettingsRedirect));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useNeedt3Ui.setState({ settingsOpen: false, settingsSection: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("SettingsRedirect", () => {
  it("opens Plan for ?section=billing and leaves for Today", async () => {
    await open("/settings?section=billing");

    expect(checkout).not.toHaveBeenCalled();
    expect(useNeedt3Ui.getState().settingsOpen).toBe(true);
    expect(useNeedt3Ui.getState().settingsSection).toBe("plan");
    expect(replace).toHaveBeenCalledWith("/today");
  });

  it.each([
    ["pro-year", { plan: "pro", interval: "year" }],
    ["pro-month", { plan: "pro", interval: "month" }],
    ["lifetime", { plan: "lifetime" }],
  ])(
    "?checkout=%s starts that checkout once and strips the param",
    async (value, choice) => {
      checkout.mockResolvedValue({ ok: true });
      await open(`/settings?section=billing&checkout=${value}`);

      expect(checkout).toHaveBeenCalledTimes(1);
      expect(checkout).toHaveBeenCalledWith(choice);
      expect(window.location.search).toBe("?section=billing");
      expect(replace).not.toHaveBeenCalled();
    }
  );

  it("does not start a second checkout when the effect runs twice", async () => {
    checkout.mockResolvedValue({ ok: true });
    window.history.replaceState(
      {},
      "",
      "/settings?section=billing&checkout=lifetime"
    );
    await act(async () => {
      root.render(h(SettingsRedirect));
    });
    await act(async () => {
      root.render(h(SettingsRedirect));
    });
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it("when checkout is closed, says the server's sentence and opens Plan", async () => {
    checkout.mockResolvedValue({ ok: false, error: "Checkout opens soon." });
    await open("/settings?section=billing&checkout=pro-year");

    expect(notify.error).toHaveBeenCalledWith(
      "Checkout opens soon.",
      expect.anything()
    );
    expect(useNeedt3Ui.getState().settingsOpen).toBe(true);
    expect(useNeedt3Ui.getState().settingsSection).toBe("plan");
    expect(replace).toHaveBeenCalledWith("/today");
  });

  it("when billing is not configured, the same", async () => {
    checkout.mockResolvedValue({
      ok: false,
      error: "Billing is not configured.",
    });
    await open("/settings?section=billing&checkout=lifetime");

    expect(notify.error).toHaveBeenCalledWith(
      "Billing is not configured.",
      expect.anything()
    );
    expect(useNeedt3Ui.getState().settingsSection).toBe("plan");
  });

  it("ignores an unknown checkout value", async () => {
    await open("/settings?section=billing&checkout=free-money");

    expect(checkout).not.toHaveBeenCalled();
    expect(useNeedt3Ui.getState().settingsSection).toBe("plan");
  });
});
