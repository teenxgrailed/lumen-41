/**
 * @jest-environment jsdom
 *
 * Safari 26 reads its bar colours from theme-color and html. On the phone the
 * hook writes the colour under the top edge into every theme-color meta and
 * the colour under the bottom edge into html, re-reading when a layer opens,
 * and puts the static fallback back on cleanup.
 */
import { act, createElement as h, useRef } from "react";

import { type Root, createRoot } from "react-dom/client";

import { toRgb, usePhoneEdgeTint } from "../usePhoneEdgeTint";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const path = "/";
jest.mock("next/navigation", () => ({ usePathname: () => path }));

let host: HTMLDivElement;
let root: Root;
let vars: Record<string, string>;

function Probe({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  usePhoneEdgeTint(ref, enabled, "dark");
  return h("div", { ref, id: "scope" });
}

beforeEach(() => {
  vars = {
    "--v3-edge-top": "rgb(20, 20, 22)",
    "--v3-edge-bottom": "rgb(20, 20, 22)",
  };
  jest.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (n: string) => vars[n] ?? "",
      }) as CSSStyleDeclaration
  );
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb) => (cb(0), 1));
  document.head.innerHTML =
    '<meta name="theme-color" content="#141416" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#f6f6f3">';
  document.documentElement.removeAttribute("style");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

const metas = () =>
  Array.from(document.head.querySelectorAll("meta")).map((m) =>
    m.getAttribute("content")
  );

describe("usePhoneEdgeTint", () => {
  it("writes the top colour to theme-color and the bottom to html", () => {
    vars["--v3-edge-top"] = "rgb(29, 27, 54)";
    act(() => root.render(h(Probe, { enabled: true })));
    expect(metas()).toEqual(["rgb(29, 27, 54)", "rgb(29, 27, 54)"]);
    expect(
      document.documentElement.style.getPropertyValue("background-color")
    ).toBe("rgb(20, 20, 22)");
    expect(
      document.documentElement.style.getPropertyPriority("background-color")
    ).toBe("important");
  });

  it("follows a layer opening (class change) and restores the fallback", async () => {
    act(() => root.render(h(Probe, { enabled: true })));
    vars["--v3-edge-top"] = "rgb(10, 10, 11)";
    vars["--v3-edge-bottom"] = "rgb(10, 10, 11)";
    await act(async () => {
      document.getElementById("scope")!.className = "is-open";
      await Promise.resolve();
    });
    expect(metas()).toEqual(["rgb(10, 10, 11)", "rgb(10, 10, 11)"]);
    expect(
      document.documentElement.style.getPropertyValue("background-color")
    ).toBe("rgb(10, 10, 11)");
    act(() => root.render(h(Probe, { enabled: false })));
    expect(metas()).toEqual(["#141416", "#f6f6f3"]);
    expect(
      document.documentElement.style.getPropertyValue("background-color")
    ).toBe("");
  });

  it("rewrites a resolved color-mix to rgb()", () => {
    expect(toRgb("color(srgb 0.0392157 0.0392157 0.0431373)")).toBe(
      "rgb(10, 10, 11)"
    );
    expect(toRgb("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });

  it("does nothing off the phone, or when the value is empty", () => {
    act(() => root.render(h(Probe, { enabled: false })));
    expect(metas()).toEqual(["#141416", "#f6f6f3"]);
    vars = {};
    act(() => root.render(h(Probe, { enabled: true })));
    expect(metas()).toEqual(["#141416", "#f6f6f3"]);
  });
});
