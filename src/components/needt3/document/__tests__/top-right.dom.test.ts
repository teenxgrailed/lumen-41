/**
 * @jest-environment jsdom
 *
 * The top bar's document controls: the editor's two slots keep their
 * elements across re-renders (an inline ref would empty them every time, and
 * close the Page options menu inside), and a database page has no Insert.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import * as headSlot from "@/components/pages/doc-head-slot";
import { useDocHeadSlots } from "@/components/pages/doc-head-slot";

import { DocTopRight } from "../DocTopRight";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Maks" } } }),
}));
jest.mock("../panel", () => ({
  useDocPanel: () => [false, jest.fn()],
}));

let host: HTMLDivElement;
let root: Root;
let log: Array<[HTMLElement | null, HTMLElement | null]>;
function Watch() {
  const s = useDocHeadSlots();
  log.push([s.status, s.more]);
  return null;
}

beforeEach(() => {
  log = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (isDatabase = false) =>
  act(() =>
    root.render(h("div", null, h(Watch), h(DocTopRight, { isDatabase })))
  );

describe("DocTopRight", () => {
  it("registers both slots, and a re-render does not empty them", () => {
    render();
    const last = log[log.length - 1];
    expect(last[0]).not.toBeNull();
    expect(last[1]).not.toBeNull();
    const seen = log.length;
    const set = jest.spyOn(headSlot, "setDocHeadSlot");
    render();
    render();
    // A re-render never touches the slots (an inline ref would clear and set
    // each of them again).
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
    // Nothing was ever cleared and re-set after the first registration.
    const after = log.slice(seen - 1);
    expect(after.every(([a, b]) => a === last[0] && b === last[1])).toBe(true);
  });

  it("shows Insert and Share on a text page, only Share on a database", () => {
    render(false);
    expect(host.querySelector("[data-doc-insert-btn]")).not.toBeNull();
    expect(host.querySelector("[data-doc-share-btn]")).not.toBeNull();
    render(true);
    expect(host.querySelector("[data-doc-insert-btn]")).toBeNull();
    expect(host.querySelector("[data-doc-share-btn]")).not.toBeNull();
  });
});
