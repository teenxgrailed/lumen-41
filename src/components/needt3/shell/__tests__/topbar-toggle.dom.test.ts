/**
 * @jest-environment jsdom
 *
 * One way to hide the sidebar: the panel icon in the top bar, on a plain
 * screen and with a document open. Nothing else in the bar carries the
 * toggle (the document rail used to have a second, layout-icon button), and
 * the top bar shows exactly one sync status.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

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
jest.mock("../../sync/SyncStatus", () => ({
  SyncStatus: () => h("span", { "data-sync-status": "saved" }),
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
});

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

  it("shows exactly one sync status", () => {
    path = "/pages/p1";
    render();
    expect(host.querySelectorAll("[data-sync-status]")).toHaveLength(1);
  });
});
