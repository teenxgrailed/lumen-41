/**
 * @jest-environment jsdom
 *
 * The Folder style picker: Auto and the six looks as one radio group; the
 * current one is checked, a click or an arrow key chooses.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { FolderStylePicker } from "../FolderStylePicker";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (value: number | null, onChange = jest.fn()) => {
  act(() =>
    root.render(
      h(FolderStylePicker, { id: "proj-1", value, onChange, hue: "#d1622a" })
    )
  );
  return onChange;
};
const opts = () =>
  Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]'));

describe("FolderStylePicker", () => {
  it("lists Auto and the six looks, one checked", () => {
    render(3);
    const o = opts();
    expect(o.map((x) => x.getAttribute("data-folder-style-option"))).toEqual([
      "auto",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(
      o.filter((x) => x.getAttribute("aria-checked") === "true")
    ).toHaveLength(1);
    expect(o[3].getAttribute("aria-checked")).toBe("true");
  });

  it("checks Auto when nothing is stored", () => {
    render(null);
    expect(opts()[0].getAttribute("aria-checked")).toBe("true");
    expect(opts()[0].getAttribute("aria-label")).toMatch(
      /^Auto \(random\), now /
    );
  });

  it("draws the real folder in each thumbnail, in its own look", () => {
    render(null);
    for (let n = 1; n <= 6; n++) {
      const thumb = opts()[n].querySelector(".fp-thumb");
      // look 5 shows apps, so its thumbnail is real look 5
      expect(thumb?.querySelector(`.fl-v${n}`)).not.toBeNull();
    }
  });

  it("chooses a look on click, and Auto as null", () => {
    const onChange = render(2);
    act(() => opts()[5].click());
    expect(onChange).toHaveBeenLastCalledWith(5);
    act(() => opts()[0].click());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("moves with the arrow keys, wrapping", () => {
    const onChange = render(6);
    act(() => {
      opts()[6].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
