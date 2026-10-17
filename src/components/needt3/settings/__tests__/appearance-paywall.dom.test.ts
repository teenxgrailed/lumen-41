/**
 * @jest-environment jsdom
 *
 * Settings → Appearance on Free: a locked theme or accent, and the "Upgrade"
 * line, open the paywall on that feature (not the Plan section).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { AppearanceSection } from "../AppearanceSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: "free" } }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: { prefs: {} } }),
  useUpdateSettings: () => ({ mutateAsync: jest.fn(async () => ({})) }),
  useSetPref: () => jest.fn(async () => ({})),
}));

describe("Settings → Appearance, locked choices", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onUpgrade = jest.fn();

  beforeEach(async () => {
    onUpgrade.mockClear();
    useNeedt3Ui.setState({ theme: "light" as never, accent: "blue" as never });
    host = document.createElement("div");
    host.className = "needt-v3";
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(h(AppearanceSection, { onUpgrade }));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const click = async (el: Element | null) => {
    expect(el).not.toBeNull();
    await act(async () => {
      (el as HTMLElement).click();
    });
  };

  it("the Time theme asks for the paywall on the Time theme", async () => {
    await click(host.querySelector('[data-theme-tile="time"]'));
    expect(onUpgrade).toHaveBeenCalledWith("Time theme");
  });

  it("a locked accent asks for the paywall on accent colours", async () => {
    await click(host.querySelector('button[data-accent="pink"]'));
    expect(onUpgrade).toHaveBeenCalledWith("Accent colours");
  });

  it("the Upgrade line under the swatches does the same", async () => {
    await click(host.querySelector(".settings-accent-lock .pro-limit-up"));
    expect(onUpgrade).toHaveBeenCalledWith("Accent colours");
  });
});
