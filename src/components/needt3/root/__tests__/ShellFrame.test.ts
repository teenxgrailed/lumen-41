/**
 * @jest-environment jsdom
 *
 * The guarantee behind "crossing 700 px swaps only the shell layer": mount the
 * frame, flip `ui` both ways, and check that the route children were neither
 * unmounted nor re-created, and that the <main> and the page's DOM nodes are
 * the very same nodes.
 */
import { act, createElement as h, useEffect } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { PhoneUi } from "@/lib/needt3/phone-ui";

import { ShellFrame } from "../ShellFrame";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const log = { mounts: 0, unmounts: 0 };

function Page() {
  useEffect(() => {
    log.mounts += 1;
    return () => {
      log.unmounts += 1;
    };
  }, []);
  return h("section", { id: "page" }, h("input", { id: "field" }));
}

function frame(ui: PhoneUi, over: { place?: string; focus?: boolean } = {}) {
  const desktop = ui === "desktop";
  return h(
    ShellFrame,
    {
      ui,
      top: desktop ? h("header", { id: "topbar" }) : null,
      rail: desktop ? h("aside", { id: "rail" }) : null,
      overlays: desktop ? h("div", { id: "layers" }) : h("nav", { id: "menu" }),
      placeKey: over.place ?? "today",
      mainPadding: over.focus ? "20px" : "0 20px 20px",
    },
    h(Page)
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  log.mounts = 0;
  log.unmounts = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (ui: PhoneUi, over?: Parameters<typeof frame>[1]) =>
  act(() => root.render(frame(ui, over)));

describe("ShellFrame", () => {
  it("draws the desktop chrome around the page", () => {
    render("desktop");
    expect(host.querySelector("#topbar")).not.toBeNull();
    expect(host.querySelector("#rail")).not.toBeNull();
    expect(host.querySelector("#menu")).toBeNull();
    const main = host.querySelector("main");
    expect(main?.className).toBe("shell-app-stack");
    expect(main?.hasAttribute("data-v2p-host")).toBe(false);
    expect(host.querySelector("[data-v2p-frame]")).toBeNull();
  });

  it("draws the phone chrome: the frame and the screen host carry the phone's attributes", () => {
    render("phone");
    expect(host.querySelector("#topbar")).toBeNull();
    expect(host.querySelector("#rail")).toBeNull();
    expect(host.querySelector("#menu")).not.toBeNull();
    const main = host.querySelector("main");
    expect(main?.hasAttribute("data-v2p-host")).toBe(true);
    expect(main?.className).toBe("v3-phone-host");
    expect(host.querySelectorAll("[data-v2p-frame]")).toHaveLength(1);
    expect(host.querySelector(".v2p-stage")).not.toBeNull();
    // no entry animation above a blur band
    expect(host.querySelector(".screen-enter")).toBeNull();
  });

  it("there is exactly one <main>, in either UI", () => {
    render("desktop");
    expect(host.querySelectorAll("main")).toHaveLength(1);
    render("phone");
    expect(host.querySelectorAll("main")).toHaveLength(1);
  });

  it("crossing 700 px never remounts the page, in either direction", () => {
    render("desktop");
    const main = host.querySelector("main");
    const page = host.querySelector("#page");
    const field = host.querySelector<HTMLInputElement>("#field");
    expect(log).toEqual({ mounts: 1, unmounts: 0 });
    field!.value = "typed before the swap";

    render("phone");
    expect(log).toEqual({ mounts: 1, unmounts: 0 });
    expect(host.querySelector("main")).toBe(main);
    expect(host.querySelector("#page")).toBe(page);

    render("desktop");
    render("phone");
    render("desktop");
    expect(log).toEqual({ mounts: 1, unmounts: 0 });
    expect(host.querySelector("main")).toBe(main);
    expect(host.querySelector("#page")).toBe(page);
    expect(host.querySelector<HTMLInputElement>("#field")).toBe(field);
    // the node is the same one, so what the person typed is still there
    expect(field!.value).toBe("typed before the swap");
  });

  it("starting on the phone and widening keeps the page too", () => {
    render("phone");
    const page = host.querySelector("#page");
    render("desktop");
    expect(log).toEqual({ mounts: 1, unmounts: 0 });
    expect(host.querySelector("#page")).toBe(page);
  });

  it("Focus Mode's padding changes the style only, not the tree", () => {
    render("desktop");
    const page = host.querySelector("#page");
    render("desktop", { focus: true });
    expect(host.querySelector("main")?.getAttribute("style")).toContain("20px");
    expect(host.querySelector("#page")).toBe(page);
    render("phone", { focus: true });
    expect(host.querySelector("main")?.style.padding).toBe("");
    expect(log).toEqual({ mounts: 1, unmounts: 0 });
  });

  it("moving to another place swaps the page, as before", () => {
    render("desktop", { place: "today" });
    render("desktop", { place: "tasks" });
    expect(log).toEqual({ mounts: 2, unmounts: 1 });
  });

  it("the same place on the other UI is still the same place", () => {
    render("phone", { place: "pages" });
    render("desktop", { place: "pages" });
    expect(log).toEqual({ mounts: 1, unmounts: 0 });
  });
});
