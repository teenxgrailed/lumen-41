/**
 * @jest-environment jsdom
 *
 * A shut fold is hidden from screen readers (aria-hidden) and must also
 * leave the Tab order: its rows are inert until the fold opens.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { Fold } from "../parts";

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

const render = (open: boolean) =>
  act(() =>
    root.render(
      h(Fold, {
        title: "Overdue",
        open,
        onToggle: () => undefined,
        children: h("button", { type: "button" }, "Row"),
      })
    )
  );

const body = () => host.querySelector(".nx-fold") as HTMLElement;

describe("Fold", () => {
  it("makes the rows of a shut fold inert", () => {
    render(false);
    expect(body().getAttribute("aria-hidden")).toBe("true");
    expect(body().hasAttribute("inert")).toBe(true);
  });

  it("gives the rows back once the fold opens", () => {
    render(true);
    expect(body().getAttribute("aria-hidden")).toBe("false");
    expect(body().hasAttribute("inert")).toBe(false);
  });
});
