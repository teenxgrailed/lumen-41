/**
 * @jest-environment jsdom
 *
 * The admin frame: one left nav, the current place marked, the page inside.
 */
import { type ReactNode, act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { AdminShell } from "../AdminShell";
import { ADMIN_NAV, isNavCurrent } from "../admin-nav";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/admin/system";

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));
jest.mock("next/link", () => {
  const { createElement } = jest.requireActual("react");
  return {
    __esModule: true,
    default: ({
      children,
      href,
      ...rest
    }: {
      children: ReactNode;
      href: string;
    }) => createElement("a", { href, ...rest }, children),
  };
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  pathname = "/admin/system";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render() {
  act(() =>
    root.render(h(AdminShell, null, h("p", { id: "page" }, "The page")))
  );
}

describe("AdminShell", () => {
  it("lists every admin place as a link and renders the page beside it", () => {
    render();
    const links = Array.from(host.querySelectorAll("nav a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      ADMIN_NAV.map((i) => i.href)
    );
    expect(host.querySelector("#page")?.textContent).toBe("The page");
  });

  it("marks only the current place", () => {
    pathname = "/admin/operations";
    render();
    const current = host.querySelectorAll('nav a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/admin/operations");
  });

  it("keeps a place current on its child routes, an exact one only on itself", () => {
    const item = { href: "/admin/users", label: "Users" };
    expect(isNavCurrent(item, "/admin/users/abc")).toBe(true);
    expect(isNavCurrent(item, "/admin/usersx")).toBe(false);
    const exact = { href: "/admin", label: "Overview", exact: true };
    expect(isNavCurrent(exact, "/admin")).toBe(true);
    expect(isNavCurrent(exact, "/admin/users")).toBe(false);
  });
});
