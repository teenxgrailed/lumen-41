/**
 * @jest-environment jsdom
 *
 * The six looks draw real data only: no pill without a status, no avatars
 * without members, no apps without connected apps (look 5 is then look 1).
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

const NOW = Date.parse("2026-11-22T12:00:00Z");
const render = (p: Partial<FolderProps> = {}) =>
  act(() =>
    root.render(
      h(Folder, {
        label: "Operations",
        count: 4,
        unit: "open",
        folderStyle: 1,
        glyph: h("i", { "data-g": "" }),
        peeks: [
          { key: "a", title: "Approve the sample", meta: "Today" },
          { key: "b", title: "Shoot the lookbook" },
        ],
        now: NOW,
        onClick: () => undefined,
        ariaLabel: "Open Operations",
        ...p,
      })
    )
  );
const root0 = () => host.firstElementChild as HTMLElement;

describe("Folder with a style", () => {
  it.each([1, 2, 3, 4, 6] as const)("look %i wears fl-v%i", (n) => {
    render({ folderStyle: n });
    expect(root0().className).toContain(`fl-v${n}`);
    expect(host.querySelector(".fl-title")?.textContent).toBe("Operations");
    expect(host.querySelector("[data-fl-count]")?.textContent).toBe("4");
    expect(host.querySelectorAll("[data-folder-peek]").length).toBeGreaterThan(
      0
    );
  });

  it("look 5 with no connected apps wears look 1", () => {
    render({ folderStyle: 5 });
    expect(root0().className).toContain("fl-v1");
    expect(root0().className).not.toContain("fl-v5");
    render({ folderStyle: 5, apps: [] });
    expect(root0().className).toContain("fl-v1");
  });

  it("look 5 shows exactly the connected apps, and counts them", () => {
    render({ folderStyle: 5, apps: ["gcal", "slack", "notion", "github"] });
    expect(root0().className).toContain("fl-v5");
    const tiles = [...host.querySelectorAll("[data-fl-app]")].map((e) =>
      e.getAttribute("data-fl-app")
    );
    expect(tiles).toEqual(["gcal", "slack", "notion"]);
    expect(host.querySelector(".fl-more")?.textContent).toBe("+1");
    expect(host.querySelector("[data-fl-count]")?.textContent).toBe("4");
    expect(host.querySelector(".fl-meta")?.textContent).toBe("4 apps");
  });

  it("shows no status pill, no Updated and no avatars it has no data for", () => {
    render({ folderStyle: 1 });
    expect(host.querySelector("[data-fl-status]")).toBeNull();
    render({ folderStyle: 6 });
    expect(host.querySelector("[data-fl-status]")).toBeNull();
    expect(host.querySelector("[data-fl-members]")).toBeNull();
    expect(host.querySelector(".fl-meta")?.textContent).toBe("4 open");
  });

  it("shows the pill, Updated and people when the data is there", () => {
    render({
      folderStyle: 1,
      statusLabel: "3 due today",
      updatedAt: NOW - 120_000,
    });
    expect(host.querySelector("[data-fl-status]")?.textContent).toBe(
      "3 due today"
    );
    expect(host.querySelector(".fl-meta")?.textContent).toBe(
      "4 open · Updated 2m"
    );
    render({
      folderStyle: 6,
      updatedAt: NOW - 3 * 3_600_000,
      members: [
        { id: "u1", name: "Maksym" },
        { id: "u2", name: "Lena" },
      ],
    });
    expect(host.querySelector("[data-fl-status]")?.textContent).toBe(
      "Updated 3h"
    );
    expect(host.querySelectorAll(".fl-avatar")).toHaveLength(2);
    expect(host.querySelector(".fl-meta")?.textContent).toBe(
      "4 open · 2 people"
    );
  });

  it("is still one link, one button or a static image", () => {
    render({ href: "/projects/p1", onClick: undefined });
    expect(host.querySelectorAll("a")).toHaveLength(1);
    render({ href: undefined });
    expect(host.querySelectorAll("button")).toHaveLength(1);
    render({ href: undefined, onClick: undefined });
    expect(host.querySelector('[role="img"]')).not.toBeNull();
  });

  it("without a style it is the plain folder", () => {
    render({ folderStyle: undefined });
    expect(root0().className).toContain("nx-folder");
  });
});
