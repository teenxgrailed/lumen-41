/**
 * @jest-environment jsdom
 *
 * The shared segmented control: tablist/aria-selected, the thumb sits under
 * the selected option, arrows move the selection.
 */
import { act, createElement as h, useState } from "react";

import { type Root, createRoot } from "react-dom/client";

import { Segmented } from "../Segmented";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
  { id: "inbox", label: "Inbox", count: 0 },
  { id: "today", label: "Today", count: 29 },
  { id: "upcoming", label: "Upcoming", count: 13 },
  { id: "all", label: "All Tasks" },
];

function Harness({ start }: { start: string }) {
  const [v, setV] = useState(start);
  return h(Segmented, { value: v, options: OPTIONS, onChange: setV });
}

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

const tabs = () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')];
const thumb = () => host.querySelector<HTMLElement>(".shell-seg2-layer")!;
const selected = () =>
  tabs().filter((t) => t.getAttribute("aria-selected") === "true");

describe("Segmented", () => {
  it("marks exactly the chosen option and parks the thumb under it", () => {
    act(() => root.render(h(Harness, { start: "today" })));
    expect(host.querySelector('[role="tablist"]')).toBeTruthy();
    expect(selected().map((t) => t.textContent)).toEqual(["Today29"]);
    expect(thumb().style.transform).toBe("translateX(100%)");
    expect(thumb().dataset.segThumb).toBe("1");
  });

  it("slides the thumb on click and shows counts only when above 0", () => {
    act(() => root.render(h(Harness, { start: "inbox" })));
    expect(thumb().style.transform).toBe("translateX(0%)");
    expect(host.querySelectorAll(".shell-seg2-count")).toHaveLength(2);
    act(() => tabs()[2].click());
    expect(selected()[0].textContent).toBe("Upcoming13");
    expect(thumb().style.transform).toBe("translateX(200%)");
  });

  it("moves with the arrow keys, wrapping, and focuses the new option", () => {
    act(() => root.render(h(Harness, { start: "all" })));
    const key = (k: string) =>
      act(() => {
        selected()[0].dispatchEvent(
          new KeyboardEvent("keydown", { key: k, bubbles: true })
        );
      });
    key("ArrowRight");
    expect(selected()[0].textContent).toBe("Inbox");
    expect(document.activeElement).toBe(tabs()[0]);
    key("ArrowLeft");
    expect(selected()[0].textContent).toBe("All Tasks");
    expect(thumb().style.transform).toBe("translateX(300%)");
  });
});
