/**
 * @jest-environment jsdom
 */
import { act, createElement } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PageSnapshot } from "../PageSnapshot";
import {
  pageMotionNotePop,
  pageMotionReset,
  pageMotionRun,
} from "../pageMotion";
import {
  scrollMemoryReset,
  scrollNotePop,
  scrollRecall,
} from "../scrollMemory";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let box: HTMLElement;

function pathTo(path: string) {
  act(() => root.render(createElement(PageSnapshot, { pathname: path })));
}

beforeEach(() => {
  document.body.innerHTML = `<main data-v2p-host><div class="v2p-stage"><div class="pk-screen"><div class="pk-scroll">Home</div></div></div></main>`;
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  Object.defineProperty(window, "scrollY", { value: 640, configurable: true });
  scrollMemoryReset();
  pageMotionReset();
  pathTo("/today");
});
afterEach(() => {
  act(() => root.unmount());
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  pageMotionReset();
});

describe("PageSnapshot", () => {
  it("remembers the offset of the path being left and copies the old page for another place", () => {
    pathTo("/tasks/abc");
    expect(scrollRecall("/today")).toBe(640);
    // the copy was kept, and the shell plays it when the place has changed
    pageMotionRun("forward");
    expect(document.querySelector(".pk-pg-ghost")).not.toBeNull();
  });

  it("does not record the offset on a Back: the browser has already moved", () => {
    scrollNotePop(performance.now());
    pathTo("/tasks/abc");
    expect(scrollRecall("/today")).toBe(0);
  });

  it("does not copy the page on a Back", () => {
    pageMotionNotePop();
    pathTo("/tasks/abc");
    pageMotionRun("forward");
    expect(document.querySelector(".pk-pg-ghost")).toBeNull();
  });

  it("does nothing while the path stays", () => {
    pathTo("/today");
    expect(scrollRecall("/today")).toBe(0);
  });
});
