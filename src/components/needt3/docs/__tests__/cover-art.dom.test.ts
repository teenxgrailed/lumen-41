/**
 * @jest-environment jsdom
 *
 * A cover is a picture or one of the drawn arts. An art ("art:rose") is an
 * SVG from the theme's five colours; a picture is an <img>; anything else
 * draws nothing, so a stored value that is not offered never shows a broken
 * image.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { DcCover } from "../DocParts";
import { COVER_ARTS, COVER_MOTIF } from "../style";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  host.className = "needt-v3";
  host.style.setProperty("--doc-theme-rose-cv1", "#c8352b");
  host.style.setProperty("--doc-theme-rose-cv2", "#e0574a");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const draw = (cover: string | null) =>
  act(() => root.render(h(DcCover, { cover })));

describe("DcCover", () => {
  it("draws an art as an SVG and reads its colours from the theme tokens", () => {
    draw("art:rose");
    const svg = host.querySelector("svg[data-cover-art='rose']");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    // the gradient stops follow --doc-theme-rose-cv1/cv2
    const stops = Array.from(svg!.querySelectorAll("stop")).map((s) =>
      s.getAttribute("stop-color")
    );
    expect(stops).toEqual(["#c8352b", "#e0574a"]);
    expect(host.querySelector("img")).toBeNull();
  });

  it("every offered art draws shapes of its own motif", () => {
    for (const a of COVER_ARTS) {
      draw(`art:${a}`);
      const svg = host.querySelector(`svg[data-cover-art='${a}']`);
      expect(svg).not.toBeNull();
      // the backdrop rect plus at least one shape
      expect(svg!.children.length).toBeGreaterThan(2);
      expect(COVER_MOTIF[a]).toBeTruthy();
    }
  });

  it("a picture is an image; nothing and an unknown art draw nothing", () => {
    draw("https://x.test/a.png");
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "https://x.test/a.png"
    );
    draw(null);
    expect(host.innerHTML).toBe("");
    draw("art:nope");
    expect(host.innerHTML).toBe("");
  });
});
