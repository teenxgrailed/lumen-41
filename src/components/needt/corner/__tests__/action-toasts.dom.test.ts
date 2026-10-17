/**
 * @jest-environment jsdom
 *
 * The action toasts: transient "what you did" notices as a compact pill at the
 * bottom centre, inverted against the page, with Undo, a live region, and a
 * dismiss clock that the hand holds.
 */
import { act, createElement as h } from "react";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Root, createRoot } from "react-dom/client";

import { notify } from "@/lib/notifications";

import { ActionToasts } from "../ActionToasts";
import { setNoticeSink } from "../bridge";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const css = readFileSync(
  join(process.cwd(), "src/styles/needt-action-toasts.css"),
  "utf8"
);

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(ActionToasts)));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
  setNoticeSink(null, "toast");
});

const region = () =>
  host.querySelector<HTMLElement>(".nx-action-toasts[data-assistant-avoid]");

function hover(el: Element) {
  el.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })
  );
}
function unhover(el: Element) {
  el.dispatchEvent(
    new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })
  );
}

describe("ActionToasts", () => {
  it("draws a notice as one line, title and body together", () => {
    act(() => {
      notify.success("Focus started", {
        description: "25 min on “Renew the domain”",
      });
    });
    expect(host.querySelector(".nx-action-toast-text")?.textContent).toBe(
      "Focus started · 25 min on “Renew the domain”"
    );
  });

  it("is a labelled live region the companion keeps clear of", () => {
    act(() => {
      notify.success("Saved");
    });
    const r = region();
    expect(r).not.toBeNull();
    expect(r!.getAttribute("role")).toBe("region");
    expect(r!.getAttribute("aria-live")).toBe("polite");
    act(() => {
      notify.error("Could not save");
    });
    expect(region()!.getAttribute("aria-live")).toBe("assertive");
  });

  it("runs Undo once and takes the toast away", () => {
    const undo = jest.fn();
    act(() => {
      notify.success("Placed at 14:00 · 3 Sep", {
        action: { label: "Undo", onClick: undo },
      });
    });
    const button = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Undo"
    );
    expect(button).toBeDefined();
    act(() => button!.click());
    expect(undo).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(host.querySelector(".nx-action-toast")).toBeNull();
  });

  it("leaves on its own, but not while the hand is on it", () => {
    act(() => {
      notify.success("Saved");
    });
    const r = region()!;
    act(() => hover(r));
    act(() => {
      jest.advanceTimersByTime(9000);
    });
    expect(host.querySelector(".nx-action-toast")).not.toBeNull();
    act(() => unhover(r));
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(host.querySelector(".nx-action-toast")).toBeNull();
  });

  it("stacks, newest nearest the bottom", () => {
    act(() => {
      notify.success("First");
      notify.success("Second");
    });
    const cards = [...host.querySelectorAll<HTMLElement>(".nx-action-toast")];
    expect(cards).toHaveLength(2);
    // column-reverse + order: the newest has the higher order, drawn lowest.
    expect(Number(cards[1].style.order)).toBeGreaterThan(
      Number(cards[0].style.order)
    );
  });

  it("does not draw an island notice", () => {
    act(() => {
      notify.info("Heads up", { surface: "island" });
    });
    expect(host.querySelector(".nx-action-toast")).toBeNull();
  });
});

describe("action toast stylesheet", () => {
  it("is centred at the bottom of the window", () => {
    const rule = /\.nx-action-toasts\s*\{[^}]*\}/.exec(css)![0];
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/left:\s*50%/);
    expect(rule).toMatch(/translateX\(-50%\)/);
    expect(rule).toMatch(/bottom:\s*24px/);
    expect(rule).not.toMatch(/right:/);
  });

  it("inverts against the page: fill is the text colour, ink the background", () => {
    const rule = /\.nx-action-toast\s*\{[^}]*\}/.exec(css)![0];
    expect(rule).toMatch(/background:\s*var\(--text-primary\)/);
    expect(rule).toMatch(/color:\s*var\(--background\)/);
  });

  it("sits above the tab bar on a phone and above the corner on a narrow window", () => {
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*safe-area-inset-bottom/
    );
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*bottom:\s*76px/);
  });
});
