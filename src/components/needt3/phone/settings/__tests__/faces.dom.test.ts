/**
 * @jest-environment jsdom
 *
 * Two faces, one state. `SettingsSheet` is mounted by `PermanentHosts` outside
 * the UI-dependent slot and owns which page is on show; the phone and the
 * desktop faces only draw it. Crossing 700 px must keep the page, in both
 * directions, and the sheet itself must not remount. The faces' leaves are
 * stand-ins; the real SettingsSheet runs.
 */
import { act, createElement as h, useEffect } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { PhoneUi } from "@/lib/needt3/phone-ui";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { SettingsSheet } from "../../../settings/SettingsSheet";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const G = globalThis as { __facesLog?: { mounts: number; unmounts: number } };

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Maksym K", email: "m@needt.app" } },
  }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: "free" } }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: undefined }),
}));
jest.mock("../../../ctx/Sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open
      ? jest
          .requireActual<typeof import("react")>("react")
          .createElement("div", { "data-desktop-sheet": "" }, children)
      : null,
}));
jest.mock("../PhoneSettings", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    PhoneSettings(p: {
      open: boolean;
      page: string | null;
      onPage: (p: string | null) => void;
      menu: boolean;
      onMenu: (on: boolean) => void;
      pill: string[] | null;
      onPill: (pill: string[] | null) => void;
      pageY?: { current: number };
    }) {
      return React.createElement(
        "div",
        {
          "data-phone-settings": "",
          "data-open": String(p.open),
          "data-page": p.page ?? "list",
          "data-menu": String(p.menu),
          "data-pill": p.pill ? p.pill.join(",") : "saved",
          "data-page-y": String(p.pageY?.current ?? 0),
        },
        React.createElement("button", {
          "data-go-menu": "",
          onClick: () => {
            p.onMenu(true);
            p.onPill(["docs", "ask"]);
          },
        }),
        React.createElement("button", {
          "data-scroll-page": "",
          onClick: () => {
            if (p.pageY) p.pageY.current = 240;
          },
        }),
        React.createElement("button", {
          "data-go": "day",
          onClick: () => p.onPage("day"),
        }),
        React.createElement("button", {
          "data-go": "tasks",
          onClick: () => p.onPage("tasks"),
        }),
        React.createElement("button", {
          "data-back": "",
          onClick: () => p.onPage(null),
        })
      );
    },
  };
});
/** A stand-in for one desktop section, marked with its name. */
function mockSection(...names: string[]) {
  const React = jest.requireActual<typeof import("react")>("react");
  return Object.fromEntries(
    names.map((n) => [
      n,
      () =>
        React.createElement("div", {
          "data-section": n.replace(/Section$/, "").toLowerCase(),
        }),
    ])
  );
}
jest.mock("../../../settings/AccountSection", () =>
  mockSection("AccountSection")
);
jest.mock("../../../settings/PlanSection", () => mockSection("PlanSection"));
jest.mock("../../../settings/AlertsSection", () =>
  mockSection("AlertsSection")
);
jest.mock("../../../settings/AppearanceSection", () =>
  mockSection("AppearanceSection")
);
jest.mock("../../../settings/DataSection", () => mockSection("DataSection"));
jest.mock("../../../settings/DaySection", () => mockSection("DaySection"));
jest.mock("../../../settings/KeysSection", () => mockSection("KeysSection"));
jest.mock("../../../settings/AboutSection", () => mockSection("AboutSection"));
jest.mock("../../../settings/PrefSections", () =>
  mockSection("GeneralSection", "TasksSection", "FocusSection")
);

let host: HTMLDivElement;
let root: Root;

/** Logs how often the sheet's own host is mounted: it must stay at one. */
function Probe() {
  useEffect(() => {
    G.__facesLog!.mounts += 1;
    return () => {
      G.__facesLog!.unmounts += 1;
    };
  }, []);
  return null;
}

const render = (ui: PhoneUi) =>
  act(() =>
    root.render(h(PhoneUiProvider, { value: ui }, h(Probe), h(SettingsSheet)))
  );
const q = (sel: string) => host.querySelector<HTMLElement>(sel);
const page = () => q("[data-phone-settings]")?.getAttribute("data-page");
const section = () => q("#settings-panel [data-section]")?.dataset.section;
const click = (el: Element | null) =>
  act(() => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

// jsdom does no layout: give elements a scrollTop that remembers its value.
Object.defineProperty(HTMLElement.prototype, "scrollTop", {
  configurable: true,
  get(this: HTMLElement & { __y?: number }) {
    return this.__y ?? 0;
  },
  set(this: HTMLElement & { __y?: number }, y: number) {
    this.__y = y;
  },
});

beforeEach(() => {
  // The desktop sheet mounts its section two frames after it opens; the frames
  // run at once here so each step sees the section it just chose.
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  G.__facesLog = { mounts: 0, unmounts: 0 };
  useNeedt3Ui.setState({ settingsOpen: false, settingsSection: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

describe("SettingsSheet faces", () => {
  it("the phone opens on the list; the desktop on Account", () => {
    render("phone");
    act(() => useNeedt3Ui.getState().openSettings());
    expect(page()).toBe("list");
    expect(q("[data-desktop-sheet]")).toBeNull();
    render("desktop");
    expect(q("[data-phone-settings]")).toBeNull();
    expect(section()).toBe("account");
  });

  it("a page opened on the phone is the section the desktop shows, and back again", () => {
    render("phone");
    act(() => useNeedt3Ui.getState().openSettings());
    click(q('[data-go="day"]'));
    expect(page()).toBe("day");
    render("desktop");
    expect(section()).toBe("day");
    render("phone");
    expect(page()).toBe("day");
  });

  it("a section chosen on the desktop is the page the phone shows", () => {
    render("desktop");
    act(() => useNeedt3Ui.getState().openSettings());
    click(q('[data-settings-nav="tasks"]'));
    expect(section()).toBe("tasks");
    render("phone");
    expect(page()).toBe("tasks");
  });

  it("Back on the phone returns to the list, and the list survives a crossing", () => {
    render("phone");
    act(() => useNeedt3Ui.getState().openSettings("plan"));
    expect(page()).toBe("plan");
    click(q("[data-back]"));
    expect(page()).toBe("list");
    render("desktop");
    expect(section()).toBe("plan");
    render("phone");
    expect(page()).toBe("list");
  });

  it("a deep link opens the phone on that page, not on the list", () => {
    render("phone");
    act(() => useNeedt3Ui.getState().openSettings("alerts"));
    expect(page()).toBe("alerts");
    act(() => useNeedt3Ui.getState().closeSettings());
    expect(q("[data-phone-settings]")?.getAttribute("data-open")).toBe("false");
    act(() => useNeedt3Ui.getState().openSettings());
    expect(page()).toBe("list");
  });

  it("a half-edited pill on the Menu page survives a crossing, and a desktop section leaves the page", () => {
    render("phone");
    act(() => useNeedt3Ui.getState().openSettings());
    click(q("[data-go-menu]"));
    const menu = () => q("[data-phone-settings]")?.dataset.menu;
    const pill = () => q("[data-phone-settings]")?.dataset.pill;
    expect([menu(), pill()]).toEqual(["true", "docs,ask"]);
    render("desktop");
    render("phone");
    expect([menu(), pill()]).toEqual(["true", "docs,ask"]);
    // a section chosen on the desktop is a page of its own: not the Menu page
    render("desktop");
    click(q('[data-settings-nav="tasks"]'));
    render("phone");
    expect(menu()).toBe("false");
    expect(page()).toBe("tasks");
    // each opening starts clean
    click(q("[data-go-menu]"));
    act(() => useNeedt3Ui.getState().closeSettings());
    act(() => useNeedt3Ui.getState().openSettings());
    expect([menu(), pill()]).toEqual(["false", "saved"]);
  });

  it("opened on the desktop, the phone continues on the section, not the list", () => {
    render("desktop");
    act(() => useNeedt3Ui.getState().openSettings());
    expect(section()).toBe("account");
    render("phone");
    expect(page()).toBe("account");
  });

  it("the section keeps its scroll across the crossing, both ways", () => {
    render("desktop");
    act(() => useNeedt3Ui.getState().openSettings("tasks"));
    const panel = q("#settings-panel")!;
    panel.scrollTop = 180;
    act(() => {
      panel.dispatchEvent(new Event("scroll"));
    });
    render("phone");
    expect(page()).toBe("tasks");
    expect(q("[data-phone-settings]")?.getAttribute("data-page-y")).toBe("180");
    click(q("[data-scroll-page]"));
    render("desktop");
    expect(q("#settings-panel")!.scrollTop).toBe(240);
  });

  it("a new section starts at its top", () => {
    render("desktop");
    act(() => useNeedt3Ui.getState().openSettings("tasks"));
    const panel = q("#settings-panel")!;
    panel.scrollTop = 180;
    act(() => {
      panel.dispatchEvent(new Event("scroll"));
    });
    click(q('[data-settings-nav="day"]'));
    render("phone");
    expect(page()).toBe("day");
    expect(q("[data-phone-settings]")?.getAttribute("data-page-y")).toBe("0");
  });

  it("on the phone, a page opened again from the list starts at its top", () => {
    render("phone");
    act(() => useNeedt3Ui.getState().openSettings());
    click(q('[data-go="tasks"]'));
    expect(page()).toBe("tasks");
    click(q("[data-scroll-page]"));
    click(q("[data-back]"));
    expect(page()).toBe("list");
    click(q('[data-go="tasks"]'));
    expect(page()).toBe("tasks");
    expect(q("[data-phone-settings]")?.getAttribute("data-page-y")).toBe("0");
  });

  it("crossing 700 px never remounts the host", () => {
    render("phone");
    act(() => useNeedt3Ui.getState().openSettings("plan"));
    render("desktop");
    render("phone");
    render("desktop");
    expect(G.__facesLog).toEqual({ mounts: 1, unmounts: 0 });
  });
});
