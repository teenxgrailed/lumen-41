/**
 * @jest-environment jsdom
 *
 * The inspector's Insert tab: every row sends the editor's own command id for
 * the open page, a read-only page can add nothing, and every id it can send
 * is one the editor knows.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import {
  PAGE_COMMAND_EVENT,
  PAGE_COMMAND_IDS,
  type PageCommandDetail,
} from "@/components/pages/page-commands";

import { INSERT_GROUPS, InsertPanel } from "../InsertPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const sent: PageCommandDetail[] = [];
const on = (e: Event) =>
  sent.push((e as CustomEvent<PageCommandDetail>).detail);

beforeEach(() => {
  sent.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  window.addEventListener(PAGE_COMMAND_EVENT, on);
});
afterEach(() => {
  window.removeEventListener(PAGE_COMMAND_EVENT, on);
  act(() => root.unmount());
  host.remove();
});

const rows = () =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("[data-insert-command]"));

describe("InsertPanel", () => {
  it("a row sends its command for this page", () => {
    act(() => root.render(h(InsertPanel, { pageId: "p1", canEdit: true })));
    const row = host.querySelector<HTMLButtonElement>(
      '[data-insert-command="heading2"]'
    );
    act(() => row?.click());
    expect(sent).toEqual([{ pageId: "p1", command: "heading2" }]);
  });

  it("a read-only page adds nothing", () => {
    act(() => root.render(h(InsertPanel, { pageId: "p1", canEdit: false })));
    expect(rows().every((r) => r.disabled)).toBe(true);
    act(() => rows()[0].click());
    expect(sent).toEqual([]);
  });

  it("lists the groups in order and every id is one the editor knows", () => {
    act(() => root.render(h(InsertPanel, { pageId: "p1", canEdit: true })));
    expect(
      Array.from(host.querySelectorAll(".docs-dc-label-1")).map(
        (e) => e.textContent
      )
    ).toEqual(["Basics", "From Needt", "Collections"]);
    const ids = INSERT_GROUPS.flatMap((g) => g.rows.map((r) => r.command));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(PAGE_COMMAND_IDS).toContain(id);
    expect(rows()).toHaveLength(ids.length);
  });
});
