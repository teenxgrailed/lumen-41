/**
 * @jest-environment jsdom
 *
 * Folder: up to three sheets, the count pill, an empty state, and one link or
 * one button for the whole folder.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { Folder, type FolderProps } from "../Folder";

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

const peek = (n: number) => ({
  key: `k${n}`,
  title: `Task ${n}`,
  meta: n === 1 ? "Today" : undefined,
});
const render = (p: Partial<FolderProps> = {}) =>
  act(() =>
    root.render(
      h(Folder, {
        label: "Operations",
        count: 4,
        sticker: h("i", { "data-sticker": "" }),
        peeks: [peek(1), peek(2)],
        href: "/projects/p1",
        ariaLabel: "Open Operations",
        ...p,
      })
    )
  );
const sheets = () => host.querySelectorAll("[data-folder-peek]");

describe("Folder", () => {
  it("is one link with the label, count, sticker and sheets", () => {
    render();
    const links = host.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/projects/p1");
    expect(links[0].getAttribute("aria-label")).toBe("Open Operations");
    expect(host.querySelector(".nx-folder-label")?.textContent).toBe(
      "Operations"
    );
    expect(host.querySelector("[data-folder-count]")?.textContent).toBe("4");
    expect(host.querySelector("[data-sticker]")).not.toBeNull();
    expect(sheets()).toHaveLength(2);
    // the sheets carry a mark and no text; titles go to a hidden description
    for (const el of host.querySelectorAll("[data-folder-peek]")) {
      expect(el.textContent).toBe("");
      expect(el.querySelector(".nx-folder-peek-mark")).not.toBeNull();
    }
    const desc = host.querySelector(".nx-folder-desc") as HTMLElement;
    expect(desc.textContent).toBe("Next: Task 1; Task 2");
    expect(links[0].getAttribute("aria-describedby")).toBe(desc.id);
  });

  it("renders the caption under the label, and none when omitted", () => {
    render({ caption: "Next: German vocabulary" });
    expect(host.querySelector(".nx-folder-caption")?.textContent).toBe(
      "Next: German vocabulary"
    );
    render({ caption: undefined });
    expect(host.querySelector(".nx-folder-caption")).toBeNull();
  });

  it("shows three sheets at most", () => {
    render({ peeks: [1, 2, 3, 4, 5].map(peek) });
    expect(sheets()).toHaveLength(3);
  });

  it("is an empty folder with no sheets, and no pill when count is omitted", () => {
    render({ peeks: [], count: undefined });
    expect(sheets()).toHaveLength(0);
    expect(host.querySelector(".nx-folder-front")).not.toBeNull();
    expect(host.querySelector("[data-folder-count]")).toBeNull();
  });

  it("shows a zero count rather than hiding it", () => {
    render({ peeks: [], count: 0 });
    expect(host.querySelector("[data-folder-count]")?.textContent).toBe("0");
  });

  it("is one button when it has onClick and no href", () => {
    const onClick = jest.fn();
    render({ href: undefined, onClick });
    expect(host.querySelectorAll("a")).toHaveLength(0);
    const b = host.querySelector("button") as HTMLButtonElement;
    expect(b.type).toBe("button");
    act(() => b.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("takes a text count and no sticker", () => {
    render({ count: "83 photos", sticker: undefined });
    expect(host.querySelector("[data-folder-count]")?.textContent).toBe(
      "83 photos"
    );
    expect(host.querySelector(".nx-folder-sticker")).toBeNull();
  });

  it("is a plain non-focusable div with neither href nor onClick", () => {
    render({ href: undefined });
    expect(host.querySelector("a, button")).toBeNull();
    const d = host.querySelector(".nx-folder") as HTMLElement;
    expect(d.tagName).toBe("DIV");
    expect(d.hasAttribute("tabindex")).toBe(false);
  });

  it("applies an inline style next to the hue", () => {
    render({ hue: "red", style: { animationDelay: "80ms" } });
    const a = host.querySelector("a") as HTMLElement;
    expect(a.style.animationDelay).toBe("80ms");
    expect(a.style.getPropertyValue("--nx-folder-hue")).toBe("red");
  });

  it("passes data attributes to the root", () => {
    render({ extra: { "data-ctx": "project", "data-ctx-id": "p1" } });
    const a = host.querySelector("a") as HTMLElement;
    expect(a.getAttribute("data-ctx")).toBe("project");
    expect(a.getAttribute("data-ctx-id")).toBe("p1");
  });
});
