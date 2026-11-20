/**
 * @jest-environment jsdom
 *
 * The tile menu, mounted for real with its data mocked:
 * - it draws the account's tiles in order, a 2x1 tile wide;
 * - a tap closes the menu and goes where the tile goes;
 * - each tile carries one name and the real things (tasks, papers) of its object;
 * - a tile with several pages turns through them on the shared timer;
 * - editing (Edit tiles, or a hold on a tile) shows a minus, a size button
 *   and Add (the catalogue of real previews); each change is one save of the
 *   whole ordered list;
 * - every place stays reachable under Places;
 * - Escape ends editing first and only then closes;
 * - behind it the screen is inert while it is open.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { MenuLayout } from "@/lib/phone-menu/layout";

import { phoneCover } from "../../../shell/cover";
import { TileMenu, type TileMenuProps } from "../TileMenu";
import { __beat } from "../beat";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const save = jest.fn(async () => true);
let layout: MenuLayout = { style: "tiles", tiles: [] };

jest.mock("@/lib/needt3/hooks/phone-menu", () => ({
  usePhoneMenu: () => ({ data: layout }),
  useSavePhoneMenu: () => save,
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({
    data: [
      { id: "p1", name: "Resale", color: "#c05", archived: false },
      { id: "p2", name: "Archive", color: null, archived: true },
    ],
  }),
}));
jest.mock("../useTileFacts", () => ({
  useTileFacts: (counts: unknown) => ({
    counts,
    focus: null,
    streak: 4,
    projects: new Map([
      [
        "p1",
        {
          name: "Resale",
          hue: "#c05",
          open: 2,
          titles: ["Photos", "List", "Ship"],
        },
      ],
    ]),
    today: [
      { time: "09:00", title: "Plan the week" },
      { time: "10:30", title: "Call the factory" },
      { time: null, title: "Pay rent" },
      { time: null, title: "Water the plants" },
      { time: null, title: "Stretch" },
    ],
    events: [],
    nowMin: 600,
    habitRows: [],
    inboxTitles: [],
    mailRows: [],
    docs: [],
  }),
}));

let host: HTMLDivElement;
let root: Root;

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));

const base: TileMenuProps = {
  open: true,
  onClose: () => {},
  counts: { today: 3, mail: 2 },
  onPick: () => {},
  onProject: () => {},
  onFocus: () => {},
};

function mount(p: Partial<TileMenuProps> = {}) {
  const calls = {
    close: 0,
    pick: [] as string[],
    project: [] as string[],
    focus: 0,
  };
  const props: TileMenuProps = {
    ...base,
    onClose: () => (calls.close += 1),
    onPick: (id) => calls.pick.push(id),
    onProject: (id) => calls.project.push(id),
    onFocus: () => (calls.focus += 1),
    ...p,
  };
  act(() =>
    root.render(
      h(
        "div",
        { "data-v2p-frame": "" },
        h("main", { "data-v2p-host": "" }, h("button", { id: "behind" })),
        h(TileMenu, props)
      )
    )
  );
  return calls;
}

beforeEach(() => {
  jest.useFakeTimers();
  // the faked clock starts at 0, inside the 400 ms a hold swallows its tap
  jest.advanceTimersByTime(1000);
  save.mockClear();
  layout = {
    style: "tiles",
    tiles: [
      { id: "today", size: "1x1" },
      { id: "ask", size: "2x1" },
      { id: "project", size: "1x1", projectId: "p1" },
    ],
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const pointer = (el: Element, type: string, x = 10, y = 10) =>
  act(() => {
    el.dispatchEvent(
      Object.assign(
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
        {
          pointerId: 1,
        }
      )
    );
  });

describe("the tile menu", () => {
  it("draws the account's tiles in order, the 2x1 one wide", () => {
    mount();
    expect(
      qa("[data-ntm-tile]").map((n) => n.getAttribute("data-ntm-tile"))
    ).toEqual(["today", "ask", "project:p1"]);
    expect(q('[data-tile="ask"]')!.className).toContain("is-wide");
    expect(q('[data-tile="today"]')!.className).not.toContain("is-wide");
    expect(q('[data-tile="today"]')!.textContent).toContain("3 left");
    expect(q('[data-tile="project"]')!.textContent).toContain("Resale");
    expect(q('[data-tile="project"]')!.textContent).toContain("2 open");
  });

  it("every tile carries one name, and shows its real things", () => {
    mount();
    for (const t of qa("[data-ntm-tile]"))
      expect(t.querySelectorAll(".ntm-name")).toHaveLength(1);
    const today = q('[data-tile="today"]')!;
    expect(today.textContent).toContain("Plan the week");
    expect(today.textContent).toContain("09:00");
    expect(today.textContent).not.toContain("Stretch"); // the fifth is on the next page
    expect(q('[data-tile="ask"] .ntm-name')!.textContent).toBe("Ask Needt");
    const papers = qa('[data-tile="project"] .ntm-paper').map(
      (n) => n.textContent
    );
    expect(papers).toEqual(["Photos", "List", "Ship"]);
  });

  it("a tile with several pages turns to the next on the shared timer, and stands still when the menu is edited", () => {
    mount();
    const today = () => q('[data-tile="today"]')!.textContent ?? "";
    expect(today()).toContain("Plan the week");
    act(() => {
      jest.advanceTimersByTime(4100); // the fourth beat: the next page is due
    });
    act(() => {
      jest.advanceTimersByTime(400); // the old one blurs out, the next goes in
    });
    expect(today()).toContain("Stretch");
    expect(today()).not.toContain("Plan the week");
    // editing: nothing listens, so the clock stops
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    expect(__beat.listeners()).toBe(0);
  });

  it("leaves no listener on the shared timer once it is gone", () => {
    mount();
    expect(__beat.listeners()).toBeGreaterThan(0);
    act(() => root.unmount());
    expect(__beat.listeners()).toBe(0);
    root = createRoot(host);
  });

  it("is a labelled modal dialog, and the screen behind is inert while it is open", () => {
    mount();
    const dlg = q('[role="dialog"]')!;
    expect(dlg.getAttribute("aria-label")).toBe("Menu");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(q("[data-v2p-host]")!.hasAttribute("inert")).toBe(true);
    mount({ open: false });
    expect(q("[data-v2p-host]")!.hasAttribute("inert")).toBe(false);
  });

  it("takes the dock away (a cover) while it is open", () => {
    expect(phoneCover.active()).toBe(false);
    mount();
    expect(phoneCover.active()).toBe(true);
    mount({ open: false });
    expect(phoneCover.active()).toBe(false);
  });

  it("a tap closes the menu and goes to the place, the project or the Focus sheet", () => {
    const c = mount();
    act(() =>
      q<HTMLButtonElement>('[data-tile="today"] [data-ntm-hit]')!.click()
    );
    act(() =>
      q<HTMLButtonElement>('[data-tile="project"] [data-ntm-hit]')!.click()
    );
    expect(c.pick).toEqual(["home"]);
    expect(c.project).toEqual(["p1"]);
    expect(c.close).toBe(2);
    layout = { style: "tiles", tiles: [{ id: "focus", size: "1x1" }] };
    const f = mount();
    act(() =>
      q<HTMLButtonElement>('[data-tile="focus"] [data-ntm-hit]')!.click()
    );
    expect(f.focus).toBe(1);
  });

  it("the default view is the objects only; every place is under Places", () => {
    const c = mount();
    expect(q("[data-ntm-place]")).toBeNull();
    act(() => q<HTMLButtonElement>("[data-ntm-places]")!.click());
    expect(q(".ntm-grid")).toBeNull();
    expect(q('[data-ntm-place="projects"]')).not.toBeNull();
    expect(q('[data-ntm-place="settings"]')).not.toBeNull();
    act(() => q<HTMLButtonElement>('[data-ntm-place="settings"]')!.click());
    expect(c.pick).toEqual(["settings"]);
    expect(c.close).toBe(1);
  });

  it("editing: a minus, a size button and the Add list appear; each change saves the whole list", () => {
    mount();
    expect(q("[data-ntm-remove]")).toBeNull();
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    expect(q(".ntm")!.className).toContain("is-edit");
    expect(qa("[data-ntm-remove]")).toHaveLength(3);

    act(() => q<HTMLButtonElement>('[data-ntm-remove="ask"]')!.click());
    expect(save).toHaveBeenLastCalledWith({
      tiles: [
        { id: "today", size: "1x1" },
        { id: "project", size: "1x1", projectId: "p1" },
      ],
    });

    act(() => q<HTMLButtonElement>('[data-ntm-size="today"]')!.click());
    expect(save).toHaveBeenLastCalledWith({
      tiles: [
        { id: "today", size: "2x1" },
        { id: "ask", size: "2x1" },
        { id: "project", size: "1x1", projectId: "p1" },
      ],
    });

    // Add opens the catalogue: real previews of what is not on the menu yet
    act(() => q<HTMLButtonElement>("[data-ntm-open-add]")!.click());
    expect(q(".ntm-cat")).not.toBeNull();
    act(() => q<HTMLButtonElement>('[data-ntm-add="streak"]')!.click());
    expect((save.mock.lastCall as unknown[])[0]).toEqual({
      tiles: [...layout.tiles, { id: "streak", size: "1x1" }],
    });

    // a tile already on the grid is not offered again
    expect(q('[data-ntm-add="today"]')).toBeNull();
    expect(q('[data-ntm-add="streak"] .ntm-name')!.textContent).toBe("Streak");
    act(() => q<HTMLButtonElement>("[data-ntm-cat-done]")!.click());
    expect(q(".ntm-cat")).toBeNull();
  });

  it("offers a project that is not on the grid yet, and never an archived one", () => {
    layout = { style: "tiles", tiles: [{ id: "today", size: "1x1" }] };
    mount();
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    act(() => q<HTMLButtonElement>("[data-ntm-open-add]")!.click());
    expect(
      qa('[data-ntm-add="project"] .ntm-name').map((n) => n.textContent)
    ).toEqual(["Resale"]);
    act(() => q<HTMLButtonElement>('[data-ntm-add="project"]')!.click());
    expect((save.mock.lastCall as unknown[])[0]).toEqual({
      tiles: [
        { id: "today", size: "1x1" },
        { id: "project", size: "1x1", projectId: "p1" },
      ],
    });
  });

  it("stops adding at twelve", () => {
    layout = {
      style: "tiles",
      tiles: Array.from({ length: 12 }, (_, i) => ({
        id: "project" as const,
        size: "1x1" as const,
        projectId: `x${i}`,
      })),
    };
    mount();
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    expect(q<HTMLButtonElement>("[data-ntm-open-add]")!.disabled).toBe(true);
  });

  it("arrow keys move a tile and Delete removes it, while editing", () => {
    mount();
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    const hit = q<HTMLButtonElement>('[data-tile="today"] [data-ntm-hit]')!;
    act(() => {
      hit.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect((save.mock.lastCall as unknown[])[0]).toEqual({
      tiles: [
        { id: "ask", size: "2x1" },
        { id: "today", size: "1x1" },
        { id: "project", size: "1x1", projectId: "p1" },
      ],
    });
    act(() => {
      hit.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true })
      );
    });
    expect((save.mock.lastCall as unknown[])[0]).toEqual({
      tiles: [
        { id: "ask", size: "2x1" },
        { id: "project", size: "1x1", projectId: "p1" },
      ],
    });
  });

  it("a tap on a tile while editing goes nowhere", () => {
    const c = mount();
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    act(() =>
      q<HTMLButtonElement>('[data-tile="today"] [data-ntm-hit]')!.click()
    );
    expect(c.pick).toEqual([]);
    expect(c.close).toBe(0);
  });

  it("a hold on a tile turns the menu to editing, and the tap that ends it does not open the tile", () => {
    const c = mount();
    const hit = q<HTMLButtonElement>('[data-tile="today"] [data-ntm-hit]')!;
    pointer(hit, "pointerdown");
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(q(".ntm")!.className).toContain("is-edit");
    pointer(hit, "pointerup");
    act(() => hit.click());
    expect(c.pick).toEqual([]);
  });

  it("a quick press is a tap, not a hold", () => {
    const c = mount();
    const hit = q<HTMLButtonElement>('[data-tile="today"] [data-ntm-hit]')!;
    pointer(hit, "pointerdown");
    act(() => {
      jest.advanceTimersByTime(100);
    });
    pointer(hit, "pointerup");
    act(() => {
      jest.advanceTimersByTime(600);
    });
    act(() => hit.click());
    expect(q(".ntm")!.className).not.toContain("is-edit");
    expect(c.pick).toEqual(["home"]);
  });

  it("Escape ends editing first, and only then closes", () => {
    const c = mount();
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    const esc = () =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
    esc();
    expect(q(".ntm")!.className).not.toContain("is-edit");
    expect(c.close).toBe(0);
    esc();
    expect(c.close).toBe(1);
  });

  it("the round button closes the menu, or ends editing while editing", () => {
    const c = mount();
    act(() => q<HTMLButtonElement>("[data-ntm-close]")!.click());
    expect(c.close).toBe(1);
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    expect(q("[data-ntm-close]")).toBeNull();
    act(() => q<HTMLButtonElement>("[data-ntm-done]")!.click());
    expect(q(".ntm")!.className).not.toContain("is-edit");
    expect(c.close).toBe(1);
  });

  it("an empty grid says so and still offers Add", () => {
    layout = { style: "tiles", tiles: [] };
    mount();
    expect(q(".ntm-empty")!.textContent).toBe("No tiles yet.");
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    expect(q(".ntm-empty")!.textContent).toBe("No tiles. Add one.");
    act(() => q<HTMLButtonElement>("[data-ntm-open-add]")!.click());
    expect(q('[data-ntm-add="today"]')).not.toBeNull();
  });

  it("Reset puts the four default tiles back", () => {
    mount();
    act(() => q<HTMLButtonElement>("[data-ntm-customize]")!.click());
    const reset = qa(".ntm-link").find((n) =>
      /Reset/.test(n.textContent ?? "")
    )!;
    act(() => (reset as HTMLButtonElement).click());
    expect(
      (
        (save.mock.lastCall as unknown[])[0] as { tiles: { id: string }[] }
      ).tiles.map((t) => t.id)
    ).toEqual(["today", "focus", "calendar", "habits"]);
  });

  it("renders nothing once it has shut and waited out the way out", () => {
    mount();
    mount({ open: false });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(q(".ntm")).toBeNull();
  });
});
