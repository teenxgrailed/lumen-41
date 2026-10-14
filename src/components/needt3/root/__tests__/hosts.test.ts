/**
 * @jest-environment jsdom
 *
 * The Settings sheet and the paywall are permanent: one instance on the phone
 * and on the desktop, never remounted when the UI changes. The composer and Ask
 * exist once per UI: the desktop's (PermanentHosts) on the desktop, the phone's
 * (PhoneOverlays) on the phone, never both answering one flag. The real V3Root
 * + V3Shell + ShellFrame + PermanentHosts + PhoneOverlays run; the leaves are
 * stand-ins that count mounts and unmounts.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { Look } from "@/lib/needt3/look-boot";
import type { PhoneUi } from "@/lib/needt3/phone-ui";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { V3Root } from "../V3Root";

interface Log {
  mounts: Record<string, number>;
  unmounts: Record<string, number>;
}

const G = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  __hostLog?: Log;
};
G.IS_REACT_ACT_ENVIRONMENT = true;

/** A leaf stand-in: a div with a marker that logs its mount and unmount. */
function stub(name: string, extra?: () => Record<string, unknown>) {
  const React = jest.requireActual<typeof import("react")>("react");
  return function Stub() {
    React.useEffect(() => {
      const log = G.__hostLog!;
      log.mounts[name] = (log.mounts[name] ?? 0) + 1;
      return () => {
        log.unmounts[name] = (log.unmounts[name] ?? 0) + 1;
      };
    }, []);
    return React.createElement("div", { "data-stub": name, ...extra?.() });
  };
}

jest.mock("@/styles/v3-entry.css", () => ({}), { virtual: true });
jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: () => {} }),
}));

jest.mock("../../composer/Composer", () => {
  const { useNeedt3Ui: store } = jest.requireActual("@/store/needt3-ui");
  const React = jest.requireActual<typeof import("react")>("react");
  const Base = stub("composer");
  return {
    ComposerHost() {
      const open = store((s: { composerOpen: boolean }) => s.composerOpen);
      return React.createElement(
        "div",
        { "data-host": "composer", "data-open": String(open) },
        React.createElement(Base)
      );
    },
  };
});
// The controller behind both Ask faces: counted, not run.
jest.mock("../../corner/useAskNeedt", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const api = {
    messages: [],
    phase: "idle",
    send: () => Promise.resolve(),
    stop: () => {},
    reset: () => {},
    popLast: () => null,
  };
  return {
    useAskNeedt() {
      React.useEffect(() => {
        const log = G.__hostLog!;
        log.mounts["ask-controller"] = (log.mounts["ask-controller"] ?? 0) + 1;
        return () => {
          log.unmounts["ask-controller"] =
            (log.unmounts["ask-controller"] ?? 0) + 1;
        };
      }, []);
      return api;
    },
  };
});
jest.mock("../../corner/useAskScope", () => ({
  useAskScope: () => ({
    scope: { kind: "workspace" },
    list: [],
    setPick: () => {},
  }),
}));
jest.mock("../../corner/CornerLayer", () => ({
  CornerLayer: stub("ask"),
}));
jest.mock("../../settings/SettingsSheet", () => ({
  SettingsSheet: stub("settings"),
}));
jest.mock("../../paywall/PaywallHost", () => ({
  PaywallHost: stub("paywall"),
}));
jest.mock("../../ctx/CtxLayer", () => ({ CtxLayer: stub("ctx") }));
jest.mock("../../palette/CommandPalette", () => ({
  CommandPalette: stub("palette"),
}));
jest.mock("../../phone/shell/PhoneShell", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { PhoneOverlays } = jest.requireActual(
    "../../phone/overlays/PhoneOverlays"
  );
  const Base = stub("phone-shell");
  return {
    // the phone chrome stand-in carries the real overlay host, as PhoneShell does
    PhoneShell: () =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Base),
        React.createElement(PhoneOverlays)
      ),
  };
});
jest.mock("../../phone/overlays/Composer", () => ({
  StoreComposer: stub("phone-composer"),
}));
jest.mock("../../phone/overlays/Ask", () => ({
  StoreAsk: stub("phone-ask"),
}));
jest.mock("../../phone/overlays/TaskSheet", () => ({
  PkTaskSheet: () => null,
}));
jest.mock("../../phone/overlays/Paywall", () => ({
  PkPaywall: () => null,
}));
jest.mock("../../phone/overlays/EventSheet", () => ({
  StoreEventSheet: () => null,
  StoreNewEventSheet: () => null,
}));
jest.mock("../../shell/CustomizeSidebar", () => ({
  CustomizeSidebar: stub("customize"),
}));
jest.mock("../../shell/KeySheet", () => ({ KeySheet: stub("keys") }));
jest.mock("../../shell/Sidebar", () => ({ Sidebar: stub("sidebar") }));
jest.mock("../../shell/TopIcons", () => ({ WhatsNew: stub("news") }));
jest.mock("../../shell/Topbar", () => ({ Topbar: stub("topbar") }));

const client = new QueryClient();
let host: HTMLDivElement;
let root: Root;

const render = (ui: PhoneUi, initialLook?: Look) =>
  act(() =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          V3Root,
          { initialUi: ui, uiForced: true, initialLook },
          h("section", { id: "page" })
        )
      )
    )
  );

const q = (name: string) => host.querySelector(`[data-stub="${name}"]`);

beforeEach(() => {
  G.__hostLog = { mounts: {}, unmounts: {} };
  useNeedt3Ui.setState({ composerOpen: false, askOpen: false });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const count = (...names: string[]) =>
  names.reduce(
    (n, name) => n + host.querySelectorAll(`[data-stub="${name}"]`).length,
    0
  );

describe("hosts", () => {
  it.each(["phone", "desktop"] as const)(
    "%s: the frame starts below a fixed top banner",
    (ui) => {
      render(ui);
      const frame = host.querySelector<HTMLElement>(".needt-v3");
      expect(frame?.className).toContain("pt-[var(--needt-top-banner,0px)]");
    }
  );

  it("phone: Settings and paywall are mounted; exactly one composer and one Ask, the phone's", () => {
    useNeedt3Ui.setState({ composerOpen: true, askOpen: true });
    render("phone");
    expect(count("settings")).toBe(1);
    expect(count("paywall")).toBe(1);
    // one composer and one Ask in total, and they are the phone's
    expect(count("composer", "phone-composer")).toBe(1);
    expect(count("ask", "phone-ask")).toBe(1);
    expect(count("phone-composer")).toBe(1);
    expect(count("phone-ask")).toBe(1);
    expect(count("composer")).toBe(0);
    expect(count("ask")).toBe(0);
    // and the phone chrome is the phone's, not the desktop's layers
    expect(q("phone-shell")).not.toBeNull();
    expect(q("palette")).toBeNull();
    expect(q("ctx")).toBeNull();
  });

  it("desktop: Settings and paywall are mounted; exactly one composer and one Ask, the desktop's", () => {
    useNeedt3Ui.setState({ composerOpen: true, askOpen: true });
    render("desktop");
    expect(count("settings")).toBe(1);
    expect(count("paywall")).toBe(1);
    expect(count("composer", "phone-composer")).toBe(1);
    expect(count("ask", "phone-ask")).toBe(1);
    expect(count("composer")).toBe(1);
    expect(count("ask")).toBe(1);
    expect(q("palette")).not.toBeNull();
    expect(q("phone-shell")).toBeNull();
  });

  it("closed, the phone mounts no composer or Ask at all", () => {
    render("phone");
    expect(count("composer", "phone-composer", "ask", "phone-ask")).toBe(0);
  });

  it("the hosts sit inside the frame, not in the UI-dependent slot", () => {
    useNeedt3Ui.setState({ composerOpen: true, askOpen: true });
    render("phone");
    const frame = host.querySelector("[data-v2p-frame]")!;
    for (const name of ["settings", "phone-composer", "phone-ask"])
      expect(frame.contains(q(name))).toBe(true);
    render("desktop");
    const scope = host.querySelector(".needt-v3")!;
    for (const name of ["settings", "composer", "ask", "paywall"])
      expect(scope.contains(q(name))).toBe(true);
  });

  it("switching the UI keeps Settings and the paywall; the open composer is taken up by the other UI's", () => {
    useNeedt3Ui.setState({ composerOpen: true });
    render("phone");
    const settings = q("settings");
    const paywall = q("paywall");
    expect(count("phone-composer")).toBe(1);

    render("desktop");
    expect(q("settings")).toBe(settings);
    expect(q("paywall")).toBe(paywall);
    expect(useNeedt3Ui.getState().composerOpen).toBe(true);
    expect(count("composer")).toBe(1);
    expect(count("phone-composer")).toBe(0);

    render("phone");
    expect(count("phone-composer")).toBe(1);
    expect(count("composer")).toBe(0);

    for (const name of ["settings", "paywall"]) {
      expect(G.__hostLog!.mounts[name]).toBe(1);
      expect(G.__hostLog!.unmounts[name] ?? 0).toBe(0);
    }
    expect(G.__hostLog!.unmounts["phone-shell"]).toBe(1);
  });

  it("one Ask controller above the face switch: crossing 700 px does not restart it", () => {
    render("phone");
    expect(G.__hostLog!.mounts["ask-controller"]).toBe(1);
    render("desktop");
    render("phone");
    render("desktop");
    expect(G.__hostLog!.mounts["ask-controller"]).toBe(1);
    expect(G.__hostLog!.unmounts["ask-controller"] ?? 0).toBe(0);
  });

  describe("first paint", () => {
    const osDark = (dark: boolean) =>
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
          matches: query.includes("prefers-color-scheme: dark") ? dark : false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }),
      });
    const scope = () => host.querySelector<HTMLElement>(".needt-v3")!;
    const look = (over: Partial<Look>): Look => ({
      choice: "light",
      accent: "blue",
      side: "light",
      palette: null,
      ...over,
    });

    beforeEach(() => {
      window.localStorage.clear();
      document.cookie = "needt-look=; Max-Age=0; Path=/";
      useNeedt3Ui.setState({ theme: "system", accent: "blue" });
    });

    it("a Light choice on a dark OS with nothing in localStorage is Light, not dark", () => {
      osDark(true);
      render("desktop", look({ choice: "light", accent: "pink" }));
      expect(scope().getAttribute("data-theme")).toBe("light");
      expect(scope().getAttribute("data-accent")).toBe("pink");
      expect(useNeedt3Ui.getState().theme).toBe("light");
      expect(document.cookie).toContain("needt-look=light.light.pink");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });

    it("the server's saved choice beats a stale localStorage copy", () => {
      osDark(false);
      useNeedt3Ui.setState({ theme: "dark" });
      render("phone", look({ choice: "light" }));
      expect(scope().getAttribute("data-theme")).toBe("light");
      expect(useNeedt3Ui.getState().theme).toBe("light");
    });

    it("System follows the OS and the boot script sits first in the scope", () => {
      osDark(true);
      render("desktop", look({ choice: "system", side: null }));
      expect(scope().getAttribute("data-theme")).toBe("dark");
      const first = scope().firstElementChild as HTMLElement;
      expect(first.tagName).toBe("SCRIPT");
      expect(first.textContent).toContain("data-theme-choice");
    });

    it("Time wears its last palette until it has measured the sky", () => {
      osDark(false);
      render(
        "desktop",
        look({
          choice: "time",
          side: "dark",
          palette: { bg: "#25222b", raised: "#312d38", ink: "#eeebf2" },
        })
      );
      expect(scope().getAttribute("data-theme")).toBe("dark");
      expect(scope().getAttribute("data-drift")).toBe("on");
      expect(scope().style.getPropertyValue("--background")).toBe("#25222b");
    });
  });
});
