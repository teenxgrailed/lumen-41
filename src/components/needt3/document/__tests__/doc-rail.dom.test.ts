/**
 * @jest-environment jsdom
 *
 * The open document's rail: Contents follows the outline the page publishes
 * and a row scrolls to it, Find counts and steps through matches in the
 * page's text, the switcher hands the rail between the document and the
 * places, and the back arrow goes to the grid.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { DocRail, DocSwitch } from "../DocRail";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/pages/p1",
}));
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useDoc: () => ({
    data: {
      id: "p1",
      title: "Launch brief",
      updatedAt: null,
      createdAt: null,
      coverUrl: null,
      style: null,
    },
  }),
}));
let filesQ: { data?: unknown[]; isSuccess: boolean; isError: boolean } = {
  data: [],
  isSuccess: true,
  isError: false,
};
const addFile = jest.fn();
jest.mock("@/lib/needt3/hooks/doc-files", () => ({
  usePageFiles: () => filesQ,
  useAddPageFile: () => ({ mutate: (...a: unknown[]) => addFile(...a) }),
}));
jest.mock("../../docs/DocParts", () => ({
  docsCopy: jest.requireActual("../../docs/DocParts").docsCopy,
  useDocTokens: () => () => "",
  DocThumb: () => null,
}));

let host: HTMLDivElement;
let root: Root;
const ui = () => useNeedt3Ui.getState();

beforeEach(() => {
  push.mockClear();
  addFile.mockClear();
  filesQ = { data: [], isSuccess: true, isError: false };
  document.body.innerHTML = "";
  const sheet = document.createElement("article");
  sheet.setAttribute("data-doc-sheet", "");
  sheet.innerHTML =
    '<div class="needt-page-editor"><h2>Scope</h2><p>the plan, The end</p></div>';
  const page = document.createElement("div");
  page.setAttribute("data-doc-page", "");
  page.appendChild(sheet);
  document.body.appendChild(page);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  ui().setDocRailTab("outline");
  ui().setDocRail("doc");
  ui().setDocOutline([
    { text: "Launch brief", level: 0 },
    { text: "Scope", level: 1 },
  ]);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("DocRail", () => {
  it("shows the title and the published outline, indented by level", () => {
    act(() => root.render(h(DocRail)));
    expect(host.textContent).toContain("Updated");
    const rows = Array.from(host.querySelectorAll<HTMLElement>(".nav-row"));
    expect(rows.map((r) => r.textContent)).toEqual(["Launch brief", "Scope"]);
    expect(rows[0].style.paddingLeft).toBe("8px");
    expect(rows[1].style.paddingLeft).toBe("22px");
    expect(rows[0].getAttribute("aria-current")).toBe("true");
  });

  it("a row scrolls the page to its heading and becomes current", () => {
    const into = jest.fn();
    const h2 = document.querySelector("h2") as HTMLElement;
    h2.scrollIntoView = into;
    act(() => root.render(h(DocRail)));
    const rows = host.querySelectorAll<HTMLElement>(".nav-row");
    act(() => rows[1].click());
    expect(into).toHaveBeenCalledTimes(1);
    expect(rows[1].getAttribute("aria-current")).toBe("true");
    expect(rows[0].getAttribute("aria-current")).toBeNull();
  });

  it("says where headings show up when the page has none", () => {
    ui().setDocOutline([{ text: "Launch brief", level: 0 }]);
    act(() => root.render(h(DocRail)));
    expect(host.querySelector(".doc-rail-hint")?.textContent).toMatch(
      /Headings on the page/
    );
  });

  it("the back arrow goes to the grid", () => {
    act(() => root.render(h(DocRail)));
    const back = host.querySelector<HTMLElement>(
      '[aria-label="Back to Documents"]'
    );
    act(() => back?.click());
    expect(push).toHaveBeenCalledWith("/pages");
  });

  it("Find counts matches, ignoring case, and steps through them", () => {
    ui().setDocRailTab("find");
    act(() => root.render(h(DocRail)));
    const input = host.querySelector<HTMLInputElement>(".docs-find-input")!;
    const count = () => host.querySelector(".docs-panel-find-9")?.textContent;
    expect(count()).toBe("Type to search");
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      set.call(input, "the");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(count()).toBe("1 of 2");
    const next = host.querySelector<HTMLElement>('[aria-label="Next"]')!;
    act(() => next.click());
    expect(count()).toBe("2 of 2");
    act(() => next.click());
    expect(count()).toBe("1 of 2");
    const prev = host.querySelector<HTMLElement>('[aria-label="Previous"]')!;
    act(() => prev.click());
    expect(count()).toBe("2 of 2");
    // Match case: "the" matches once, "THE" not at all, "The" once.
    const cased = host.querySelector<HTMLElement>('[aria-label="Match case"]')!;
    act(() => cased.click());
    expect(count()).toBe("1 of 1");
    const type = (v: string) =>
      act(() => {
        set.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    type("THE");
    expect(count()).toBe("No results");
    type("The");
    expect(count()).toBe("1 of 1");
  });
});

describe("DocSwitch", () => {
  it("picks the rail's content and never re-sends the one it shows", () => {
    act(() => root.render(h(DocSwitch, { value: "doc" })));
    const tab = (id: string) =>
      host.querySelector<HTMLElement>(`[data-sb-switch="${id}"]`)!;
    expect(tab("doc").getAttribute("aria-selected")).toBe("true");
    act(() => tab("doc").click());
    expect(ui().docRail).toBe("doc");
    act(() => tab("app").click());
    expect(ui().docRail).toBe("app");
  });
});

describe("the four tabs", () => {
  const tabs = () =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="tab"][title]'));

  it("are Contents, Tasks in this document, Files and Find in document", () => {
    act(() => root.render(h(DocRail)));
    expect(tabs().map((t) => t.getAttribute("aria-label"))).toEqual([
      "Contents",
      "Tasks in this document",
      "Files",
      "Find in document",
    ]);
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  });

  it("a tab swaps the panel", () => {
    act(() => root.render(h(DocRail)));
    act(() => tabs()[1].click());
    expect(ui().docRailTab).toBe("tasks");
    expect(host.textContent).toContain("No open tasks on this page");
    act(() => tabs()[2].click());
    expect(ui().docRailTab).toBe("files");
    expect(host.textContent).toContain("Attachments");
  });
});

describe("Tasks in this document", () => {
  const todo = (text: string, checked: boolean) =>
    `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${
      checked ? " checked" : ""
    }></label><div><p>${text}</p></div></li>`;
  const withTasks = () => {
    document.querySelector(".needt-page-editor")!.innerHTML =
      "<h2>Scope</h2>" +
      `<ul data-type="taskList">${todo("Ship it", false)}${todo("Done thing", true)}</ul>`;
  };

  it("lists the open to-dos under their heading and hides the completed", () => {
    withTasks();
    ui().setDocRailTab("tasks");
    act(() => root.render(h(DocRail)));
    const rows = Array.from(host.querySelectorAll(".docs-panel-tasks-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Ship it");
    expect(rows[0].textContent).toContain("Scope");
    expect(host.textContent).not.toContain("Done thing");
  });

  it("Show completed brings the ticked ones back", () => {
    withTasks();
    ui().setDocRailTab("tasks");
    act(() => root.render(h(DocRail)));
    const show = host.querySelector<HTMLElement>(
      '[aria-label="Show completed"]'
    )!;
    act(() => show.click());
    expect(host.textContent).toContain("Done thing");
    expect(show.getAttribute("aria-pressed")).toBe("true");
  });

  it("ticking a row ticks the box in the text", () => {
    withTasks();
    const box = document.querySelector<HTMLInputElement>(
      'li[data-type="taskItem"] input'
    )!;
    const clicked = jest.fn();
    box.addEventListener("click", clicked);
    ui().setDocRailTab("tasks");
    act(() => root.render(h(DocRail)));
    act(() => host.querySelector<HTMLElement>('[role="checkbox"]')!.click());
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("follows the page when a to-do is added", async () => {
    ui().setDocRailTab("tasks");
    act(() => root.render(h(DocRail)));
    expect(host.querySelectorAll(".docs-panel-tasks-1")).toHaveLength(0);
    await act(async () => {
      withTasks();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(host.querySelectorAll(".docs-panel-tasks-1")).toHaveLength(1);
  });
});

describe("Files", () => {
  const file = (id: string, name: string, mimeType: string, size: number) => ({
    id,
    name,
    mimeType,
    size,
    createdAt: null,
    url: `/api/pages/p1/assets/${id}`,
  });

  it("splits pictures from the rest and says kind and size", () => {
    filesQ = {
      isSuccess: true,
      isError: false,
      data: [
        file("a1", "hero.png", "image/png", 3000),
        file("a2", "sidebar-spec.pdf", "application/pdf", 240 * 1024),
      ],
    };
    ui().setDocRailTab("files");
    act(() => root.render(h(DocRail)));
    expect(host.textContent).toContain("Media");
    expect(host.querySelectorAll(".docs-files-thumb")).toHaveLength(1);
    const row = host.querySelector<HTMLAnchorElement>(".docs-panel-files-4")!;
    expect(row.textContent).toContain("sidebar-spec.pdf");
    expect(row.textContent).toContain("PDF · 240 KB");
    expect(row.getAttribute("href")).toBe("/api/pages/p1/assets/a2");
  });

  it("says so when nothing is attached, and when the list will not load", () => {
    ui().setDocRailTab("files");
    act(() => root.render(h(DocRail)));
    expect(host.textContent).toContain("Nothing attached to this page yet");
    filesQ = { isSuccess: false, isError: true };
    act(() => root.render(h(DocRail)));
    expect(host.textContent).toContain("Could not load the files");
  });

  it("the plus adds the chosen files", () => {
    ui().setDocRailTab("files");
    act(() => root.render(h(DocRail)));
    const input = host.querySelector<HTMLInputElement>("[data-doc-rail-file]")!;
    const f = new File(["x"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [f], configurable: true });
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(addFile).toHaveBeenCalledWith(f);
  });
});
