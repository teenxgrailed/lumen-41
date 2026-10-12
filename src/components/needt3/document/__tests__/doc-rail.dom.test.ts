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
