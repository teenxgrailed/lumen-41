/**
 * @jest-environment jsdom
 *
 * One way to hide the sidebar: the panel icon in the top bar, on a plain
 * screen and with a document open. Nothing else in the bar carries the
 * toggle (the document rail used to have a second, layout-icon button).
 *
 * The save status is for editing surfaces only: the top bar carries none on a
 * plain screen, exactly one while a document, page or board has registered a
 * sync source, and the offline pill (never both) when the connection is lost.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { setSyncSource } from "../../sync/sync-source";
import { ShellContext } from "../ShellContext";
import { Topbar } from "../Topbar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let path = "/tasks";
jest.mock("next/navigation", () => ({
  usePathname: () => path,
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useDoc: () => ({ data: { title: "Launch", isDatabase: false } }),
}));
jest.mock("../TopIcons", () => ({ TopIcons: () => null }));
jest.mock("../../states/useOfflineQueue", () => ({
  useOfflineQueue: () => ({ online: navigator.onLine, queued: null }),
}));
jest.mock("../../sync/useMutationHealth", () => ({
  useMutationHealth: () => ({
    mutating: 0,
    failedMutations: 0,
    retry: jest.fn(),
  }),
}));
jest.mock("../../document/DocTopRight", () => ({
  DocTopRight: () => null,
  DocPanelToggle: () => null,
}));

let host: HTMLDivElement;
let root: Root;
const toggleSidebar = jest.fn();

beforeEach(() => {
  toggleSidebar.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => setSyncSource("test", null));
  setOnline(true);
});

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

const render = () =>
  act(() => {
    root.render(
      h(
        ShellContext.Provider,
        {
          value: {
            narrow: false,
            focusMode: false,
            toggleSidebar,
            setFocusMode: jest.fn(),
            openCustomize: jest.fn(),
            openKeys: jest.fn(),
            openWhatsNew: jest.fn(),
            openBug: jest.fn(),
          },
        },
        h(Topbar)
      )
    );
  });

describe("Topbar sidebar toggle", () => {
  it.each(["/tasks", "/pages/p1"])("has a single toggle on %s", (p) => {
    path = p;
    render();
    const toggles = host.querySelectorAll('[aria-label="Toggle sidebar"]');
    expect(toggles).toHaveLength(1);
    act(() => (toggles[0] as HTMLButtonElement).click());
    expect(toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it.each(["/", "/tasks", "/calendar"])("carries no save status on %s", (p) => {
    path = p;
    render();
    expect(host.querySelector("[data-sync-status]")).toBeNull();
    expect(host.querySelector("[data-st-offline]")).toBeNull();
  });

  it.each(["/pages/p1", "/moodboards/b1"])(
    "shows exactly one save status on %s",
    (p) => {
      path = p;
      act(() => setSyncSource("test", { save: "saved" }));
      render();
      expect(host.querySelectorAll("[data-sync-status]")).toHaveLength(1);
    }
  );

  it("shows the offline pill on a plain screen, and not the save status", () => {
    setOnline(false);
    path = "/tasks";
    render();
    expect(host.querySelectorAll("[data-st-offline]")).toHaveLength(1);
    expect(host.querySelector("[data-sync-status]")).toBeNull();
  });

  it("says offline through the save status on an editing surface, not the pill", () => {
    setOnline(false);
    path = "/pages/p1";
    act(() => setSyncSource("test", { save: "offline" }));
    render();
    expect(host.querySelector("[data-st-offline]")).toBeNull();
    expect(
      host.querySelector("[data-sync-status]")?.getAttribute("data-sync-status")
    ).toBe("offline");
  });
});
