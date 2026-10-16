/**
 * @jest-environment jsdom
 *
 * The desktop Trash and Templates screens over a fake controller: Trash lists
 * pages with the other kinds, a Delete forever or an Empty Trash opens a
 * confirm that says there is no Undo and only then deletes; Templates lists
 * the built-in set after the person's own and a card makes a page.
 */
import { act, createElement as h, useState } from "react";

import { type Root, createRoot } from "react-dom/client";

import { BUILTIN_TEMPLATES } from "@/lib/needt3/builtin-templates";

import { V3PortalScope } from "../../ctx/PortalScope";
import { TemplatesScreen } from "../TemplatesScreen";
import { TrashScreen } from "../TrashScreen";
import type { TemplatesController } from "../useTemplatesController";
import type { TrashAsk, TrashController } from "../useTrashController";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../docs/DocParts", () => ({
  DocThumb: () => null,
  DcMiniPage: () => null,
  useDocTokens: () => () => "",
}));
jest.mock("../PlSceneHeader", () => ({
  PlSceneHeader: (p: { prints: { id: string }[] }) =>
    h("div", { "data-prints": p.prints.map((x) => x.id).join(",") }),
}));

const ok = <T>(data: T) =>
  ({
    status: "success",
    fetchStatus: "idle",
    data,
    error: null,
    refetch: jest.fn(),
  }) as never;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  runAsk.mockClear();
  restorePage.mockClear();
  host = document.createElement("div");
  host.className = "needt-v3";
  document.body.appendChild(host);
  root = createRoot(host);
  // Dialogs portal into the v3 scope, as they do under V3Root.
  const render = root.render.bind(root);
  root.render = (el) => render(h(V3PortalScope, null, el));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));
const click = (el: Element | null) =>
  act(() => {
    (el as HTMLElement).click();
  });
const body = () => document.body;

const runAsk = jest.fn();
const restorePage = jest.fn();

/** A controller whose confirm state is real, so the dialog opens and closes. */
function Trash({ over = {} as Partial<TrashController> }) {
  const [ask, setAsk] = useState<TrashAsk | null>(null);
  const c = {
    timeZone: "UTC",
    tasks: ok([]),
    boards: ok([]),
    docs: ok([]),
    dead: [
      {
        id: "k1",
        title: "Old task",
        trashedAt: "2026-10-01T09:00:00.000Z",
        projectId: null,
      },
    ],
    gone: [{ id: "b1", title: "Ideas", trashedAt: "2026-10-10T09:00:00.000Z" }],
    pages: [
      {
        id: "pg1",
        title: "Brief",
        trashedAt: "2026-10-12T09:00:00.000Z",
        projectId: null,
        coverUrl: null,
        style: null,
      },
    ],
    projectName: () => undefined,
    restoreTask: jest.fn(),
    restoreBoard: jest.fn(),
    restorePage,
    emptyCounts: { pages: 1, boards: 1, tasks: 1 },
    runAsk,
    ask,
    setAsk,
    ...over,
  } as unknown as TrashController;
  return h(TrashScreen, { c });
}

describe("TrashScreen", () => {
  it("lists pages first, with Restore and Delete forever on every row", () => {
    act(() => root.render(h(Trash, {})));
    expect($$(".pl-trash-h").map((e) => e.textContent)).toEqual([
      "Pages",
      "Tasks",
      "Moodboards",
    ]);
    expect($$(".pl-trash-title").map((e) => e.textContent)).toEqual([
      "Brief",
      "Old task",
      "Ideas",
    ]);
    expect($$(".pl-trash-row")).toHaveLength(3);
    expect($$("[data-trash-forever]")).toHaveLength(3);
    expect(
      $$(".pl-trash-row")[1].querySelector("[data-trash-forever]")
    ).not.toBeNull();
    expect($("[data-trash-empty]")?.textContent).toBe("Empty Trash");
  });

  it("Delete forever opens a confirm that says there is no Undo; Cancel leaves everything", () => {
    act(() => root.render(h(Trash, {})));
    click($$("[data-trash-forever]")[0]);
    expect(body().textContent).toContain("Delete “Brief” for good?");
    expect(body().textContent).toContain("can’t be undone");
    expect(runAsk).not.toHaveBeenCalled();
    const cancel = Array.from(body().querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel"
    );
    click(cancel!);
    expect(runAsk).not.toHaveBeenCalled();
  });

  it("confirming runs the delete for that page, once", () => {
    act(() => root.render(h(Trash, {})));
    click($$("[data-trash-forever]")[0]);
    click(body().querySelector("[data-trash-confirm]"));
    expect(runAsk).toHaveBeenCalledTimes(1);
    expect(runAsk).toHaveBeenCalledWith({
      kind: "page",
      id: "pg1",
      title: "Brief",
    });
  });

  it("Delete forever on a task asks for that task", () => {
    act(() => root.render(h(Trash, {})));
    click($$("[data-trash-forever]")[1]);
    expect(body().textContent).toContain("Delete “Old task” for good?");
    click(body().querySelector("[data-trash-confirm]"));
    expect(runAsk).toHaveBeenCalledWith({
      kind: "task",
      id: "k1",
      title: "Old task",
    });
  });

  it("Empty Trash asks first, counts what goes, then runs for all", () => {
    act(() => root.render(h(Trash, {})));
    click($("[data-trash-empty]"));
    expect(body().textContent).toContain("Empty Trash?");
    expect(body().textContent).toContain("1 page, 1 task and 1 moodboard");
    click(body().querySelector("[data-trash-confirm]"));
    expect(runAsk).toHaveBeenCalledWith({ kind: "all" });
  });

  it("tasks alone: they can be emptied and deleted for good", () => {
    act(() =>
      root.render(
        h(Trash, {
          over: {
            pages: [],
            gone: [],
            emptyCounts: { pages: 0, boards: 0, tasks: 1 },
          },
        })
      )
    );
    expect($("[data-trash-empty]")).not.toBeNull();
    expect($$("[data-trash-forever]")).toHaveLength(1);
    // a lone Tasks list keeps its heading
    expect($$(".pl-trash-h").map((e) => e.textContent)).toEqual(["Tasks"]);
  });

  it("an empty Trash draws the empty state", () => {
    act(() =>
      root.render(
        h(Trash, {
          over: {
            pages: [],
            gone: [],
            dead: [],
            emptyCounts: { pages: 0, boards: 0, tasks: 0 },
          },
        })
      )
    );
    expect(host.textContent).toContain("Trash is empty");
    expect($("[data-trash-empty]")).toBeNull();
  });

  it("Restore on a page row restores that page", () => {
    act(() => root.render(h(Trash, {})));
    click($$(".pl-trash-row")[0].querySelector(".nx-btn-secondary"));
    expect(restorePage).toHaveBeenCalledWith("pg1", "Brief");
  });
});

describe("TemplatesScreen", () => {
  const items = [
    { id: "t1", name: "Mine", description: "Look back", builtin: null },
  ];
  const list = [
    ...items,
    ...BUILTIN_TEMPLATES.map((b) => ({
      id: b.id,
      name: b.title,
      description: b.meta,
      builtin: b,
    })),
  ];
  const makePage = jest.fn();
  const c = {
    templates: ok([]),
    make: { isPending: false },
    list,
    makePage,
  } as unknown as TemplatesController;

  it("lists the person's templates, then the built-in set, each with a miniature of its blocks", () => {
    act(() => root.render(h(TemplatesScreen, { c })));
    const titles = $$(".docs-card-title").map((e) => e.textContent);
    expect(titles).toEqual([
      "Mine",
      "Daily note",
      "Weekly review",
      "Product drop",
      "Meeting notes",
      "Resale listing",
      "Project brief",
    ]);
    // a built-in card draws its first blocks small; the saved one is a plain page
    expect($$("[data-docs-mini]")).toHaveLength(6);
    // the banner shows built-in pages (they have a look of their own)
    expect($("[data-prints]")?.getAttribute("data-prints")).toBe(
      "builtin:daily,builtin:review,builtin:drop"
    );
    expect(host.textContent).toContain("Built in · 5 blocks");
  });

  it("a card makes a page from that template", () => {
    makePage.mockClear();
    act(() => root.render(h(TemplatesScreen, { c })));
    click(
      $$('[role="button"]').find((e) =>
        /Daily note/.test(e.ariaLabel ?? e.getAttribute("aria-label") ?? "")
      )!
    );
    expect(makePage).toHaveBeenCalledWith("builtin:daily", "Daily note");
  });
});
