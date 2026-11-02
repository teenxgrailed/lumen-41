/**
 * @jest-environment jsdom
 *
 * `/settings?section=billing&checkout=…` with design_v3 on: the sheet opens on
 * Plan, no checkout starts, and the param is gone from the address.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { startCheckout } from "@/lib/needt3/hooks/account";

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

  it.each(["pro-year", "pro-month", "lifetime"])(
    "?checkout=%s opens Plan without starting checkout and strips the param",
    async (value) => {
      await open(`/settings?section=billing&checkout=${value}`);

      // The withdrawal-right box (Terms 5.5) is in the Plan section, so the
      // link cannot start a purchase on its own.
      expect(checkout).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?section=billing");
      expect(useNeedt3Ui.getState().settingsOpen).toBe(true);
      expect(useNeedt3Ui.getState().settingsSection).toBe("plan");
      expect(replace).toHaveBeenCalledWith("/today");
    }
  );

  it("ignores an unknown checkout value", async () => {
    await open("/settings?section=billing&checkout=free-money");

    expect(checkout).not.toHaveBeenCalled();
    expect(useNeedt3Ui.getState().settingsSection).toBe("plan");
  });
});
