/**
 * @jest-environment jsdom
 *
 * The Overdue fold's head carries its action ("Move to today") at the right
 * end, and a click on it runs the handler without folding the section.
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

describe("Fold action", () => {
  it("draws the action in the head and runs it without folding", () => {
    const onMove = jest.fn();
    const onToggle = jest.fn();
    act(() =>
      root.render(
        h(Fold, {
          title: "Overdue",
          tone: "late",
          open: true,
          onToggle,
          action: h(
            "button",
            { type: "button", "data-wk-move-today": "", onClick: onMove },
            "Move to today"
          ),
          children: h("span", null, "Row"),
        })
      )
    );
    const head = host.querySelector(".hd-fold-head") as HTMLElement;
    const button = head.querySelector(
      "[data-wk-move-today]"
    ) as HTMLButtonElement;
    expect(button.textContent).toBe("Move to today");
    act(() => button.click());
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
