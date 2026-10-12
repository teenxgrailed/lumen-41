/**
 * @jest-environment jsdom
 *
 * The desktop sheet's rail (SettingsScreen.jsx): every row carries its icon,
 * the person is a disc of initials (not the shell's raised square), and the
 * plan card is the printed sky with the black PRO badge and the words on it.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { SettingsSheet } from "../SettingsSheet";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let planKind = "free";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Maksym K.", email: "maksym@needt.app" } },
  }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: planKind } }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: undefined }),
}));
jest.mock("../../root/phone-ui-context", () => ({
  usePhoneUi: () => "desktop",
}));
jest.mock("../../ctx/Sheet", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Sheet: ({ children }: { children: unknown }) =>
      createElement("div", { "data-sheet": true }, children),
  };
});
jest.mock("../../scenes", () => {
  const { createElement } = jest.requireActual("react");
  return {
    PxSky: () =>
      createElement("div", { className: "px-sky", "data-sky": true }),
    PxBadge: ({ children }: { children: unknown }) =>
      createElement("span", { "data-px-badge": true }, children),
  };
});
jest.mock("../../phone/settings/PhoneSettings", () => ({
  PhoneSettings: () => null,
}));
jest.mock("../AccountSection", () => ({ AccountSection: () => null }));
jest.mock("../AlertsSection", () => ({ AlertsSection: () => null }));
jest.mock("../DataSection", () => ({ DataSection: () => null }));
jest.mock("../DaySection", () => ({ DaySection: () => null }));
jest.mock("../KeysSection", () => ({ KeysSection: () => null }));
jest.mock("../PlanSection", () => ({ PlanSection: () => null }));
jest.mock("../AboutSection", () => ({ AboutSection: () => null }));
jest.mock("../PrefSections", () => ({
  FocusSection: () => null,
  GeneralSection: () => null,
  TasksSection: () => null,
}));
jest.mock("../AppearanceSection", () => ({ AppearanceSection: () => null }));

const NAV_IDS = [
  "account",
  "plan",
  "general",
  "appearance",
  "day",
  "tasks",
  "focus",
  "alerts",
  "keys",
  "connections",
  "data",
  "about",
];

describe("Settings rail", () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = async (kind: string) => {
    planKind = kind;
    useNeedt3Ui.setState({ settingsOpen: true, settingsSection: "account" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(h(SettingsSheet));
    });
  };

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("draws an icon in every row, the arrow after Connections", async () => {
    await mount("free");
    for (const id of NAV_IDS) {
      const row = host.querySelector(`[data-settings-nav="${id}"]`);
      expect(row).not.toBeNull();
      expect(row?.querySelector(".settings-row-5 svg")).not.toBeNull();
    }
    expect(
      host.querySelector(
        '[data-settings-nav="connections"] .settings-nav-out svg'
      )
    ).not.toBeNull();
  });

  it("opens on the person as a disc of initials, with the plan on its corner", async () => {
    await mount("free");
    const disc = host.querySelector(".settings-me .settings-me-avatar.is-lg");
    expect(disc?.textContent).toBe("MK");
    expect(host.querySelector("[data-settings-tier]")?.textContent).toBe(
      "Free"
    );
  });

  it("the plan card is the sky with the words and the PRO badge on it", async () => {
    await mount("free");
    const card = host.querySelector(".settings-plan");
    expect(card?.hasAttribute("data-px-scope")).toBe(true);
    expect(card?.querySelector("[data-sky]")).not.toBeNull();
    expect(card?.querySelector(".px-display.px-on-sky")?.textContent).toBe(
      "Needt"
    );
    expect(card?.querySelector("[data-px-badge]")?.textContent).toBe("Pro");
    expect(card?.querySelector(".px-on-sky")).not.toBeNull();
  });

  it("a lifetime plan says Lifetime on the badge", async () => {
    await mount("lifetime");
    expect(
      host.querySelector(".settings-plan [data-px-badge]")?.textContent
    ).toBe("Lifetime");
  });
});
