/**
 * @jest-environment jsdom
 *
 * A checklist item that is a real Needt task, in the page editor as a person
 * uses it: the slash menu's Task makes one; once it has words a task is made
 * with the page as its origin; ticking it completes the task and a task
 * completed elsewhere ticks it; the date chip sets the due date; taking the
 * item out of the page asks whether to delete the task too. The real
 * PageWorkspace is mounted; only the network is faked (a tiny task store).
 */
import { act, createElement as h } from "react";

import { Editor } from "@tiptap/core";
import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import { PageWorkspace } from "../PageWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => {
  const router = { push: jest.fn(), replace: jest.fn() };
  return { useRouter: () => router };
});
jest.mock("lucide-react", () => {
  const icon = () => null;
  return new Proxy(
    { __esModule: true },
    { get: (t, k) => (k in t ? (t as never)[k] : icon) }
  );
});
jest.mock("@/components/pages/DatabaseWorkspace", () => ({
  DatabaseWorkspace: () => null,
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

const reply = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

interface FakeTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  trashedAt: string | null;
  originPageId: string | null;
}

const para = (text: string) => ({
  id: "blk-1",
  parentBlockId: null,
  type: "PARAGRAPH",
  position: 1024,
  content: {
    json: text
      ? { type: "paragraph", content: [{ type: "text", text }] }
      : { type: "paragraph" },
  },
});
const pageRow = () => ({
  id: "p1",
  parentId: null,
  title: "Notes",
  icon: null,
  isPrivate: false,
  isFavorite: false,
  contentRevision: 1,
  updatedAt: "2026-10-12T09:40:00.000Z",
  database: null,
  accessRole: "FULL_ACCESS",
  userId: "u1",
  workspaceId: "w1",
  coverUrl: null,
  projectId: "proj-1",
  blocks: [para("")],
  children: [],
});

let host: HTMLDivElement;
let root: Root;
let tasks: Map<string, FakeTask>;
let calls: Array<{
  method: string;
  url: string;
  body: Record<string, unknown>;
}>;

beforeEach(() => {
  tasks = new Map();
  calls = [];
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  (global as unknown as { fetch: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/pages/p1" && method === "GET")
        return reply(200, { page: pageRow() });
      if (url.endsWith("/collaboration-token")) return reply(404, {});
      if (url.startsWith("/api/tasks")) {
        calls.push({ method, url, body });
        if (method === "GET") {
          const archived = url.includes("archived=true");
          return reply(
            200,
            archived
              ? []
              : [...tasks.values()].filter((t) => t.originPageId === "p1")
          );
        }
        if (method === "POST") {
          const task: FakeTask = {
            id: body.id,
            title: body.title,
            status: body.status ?? "todo",
            dueDate: body.dueDate ?? null,
            trashedAt: null,
            originPageId: body.originPageId ?? null,
          };
          tasks.set(task.id, task);
          return reply(200, task);
        }
        if (method === "PUT") {
          const id = url.split("/").pop()!;
          const task = tasks.get(id);
          if (!task) return reply(404, {});
          Object.assign(task, body);
          return reply(200, task);
        }
      }
      return reply(200, { folders: [], tags: [], pages: [] });
    }
  );
  window.matchMedia =
    window.matchMedia ||
    ((q: string) =>
      ({
        matches: false,
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList);
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as never;
  Range.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Element.prototype.scrollIntoView = jest.fn();
  (globalThis as { structuredClone?: unknown }).structuredClone = (
    v: unknown
  ) => JSON.parse(JSON.stringify(v));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const mount = async () => {
  await act(async () => {
    root.render(h(V3PortalScope, null, h(PageWorkspace, { pageId: "p1" })));
  });
  await wait(80);
};

const editorOf = () =>
  (
    host.querySelector(".needt-page-editor") as
      | (HTMLElement & { editor: Editor })
      | null
  )?.editor as Editor;

const key = (editor: Editor, init: KeyboardEventInit) =>
  act(async () => {
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
    );
  });

/** A task item typed through the slash menu; returns its task id. */
const typeTaskItem = async (editor: Editor, text: string) => {
  await act(async () => {
    editor.commands.insertContent("/task");
  });
  await key(editor, { key: "Enter" });
  await act(async () => {
    editor.commands.insertContent(text);
  });
  const li = host.querySelector<HTMLElement>("li[data-needt-task-item]")!;
  return li.dataset.taskId!;
};

const posts = () => calls.filter((c) => c.method === "POST");
const puts = () => calls.filter((c) => c.method === "PUT");

describe("a task item in the page", () => {
  it("the slash menu's Task makes one, and a task is made once it has words", async () => {
    await mount();
    const editor = editorOf();
    const id = await typeTaskItem(editor, "Buy milk");
    expect(id).toBeTruthy();
    // Nothing is sent while it is empty or still being typed.
    expect(posts()).toHaveLength(0);
    await wait(900);
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({
      id,
      title: "Buy milk",
      status: "todo",
      originPageId: "p1",
      projectId: "proj-1",
    });
    expect(tasks.get(id)?.title).toBe("Buy milk");
  });

  it("an empty task item makes no task", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("/task");
    });
    await key(editor, { key: "Enter" });
    await wait(900);
    expect(posts()).toHaveLength(0);
  });

  it("ticking it completes the task; completing the task elsewhere ticks it", async () => {
    await mount();
    const editor = editorOf();
    const id = await typeTaskItem(editor, "Ship it");
    await wait(900);

    const box = host.querySelector<HTMLInputElement>(
      "li[data-needt-task-item] input[type=checkbox]"
    )!;
    await act(async () => {
      box.click();
    });
    await wait(900);
    expect(puts().at(-1)?.url).toBe(`/api/tasks/${id}`);
    expect(puts().at(-1)?.body).toMatchObject({ status: "completed" });

    // Reopened elsewhere: the next look at the tasks unticks the item.
    tasks.get(id)!.status = "todo";
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await wait(300);
    expect(
      host.querySelector<HTMLElement>("li[data-needt-task-item]")!.dataset
        .checked
    ).toBe("false");
  });

  it("the date chip sets the due date, and a date set elsewhere shows on the chip", async () => {
    await mount();
    const editor = editorOf();
    const id = await typeTaskItem(editor, "Call back");
    await wait(900);

    const input = host.querySelector<HTMLInputElement>(
      ".needt-task-due-input"
    )!;
    await act(async () => {
      input.value = "2026-11-02";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait(900);
    const put = puts().at(-1)!;
    expect(put.url).toBe(`/api/tasks/${id}`);
    expect(typeof put.body.dueDate).toBe("string");
    expect(String(put.body.dueDate)).toContain("2026-11-0");

    tasks.get(id)!.dueDate = "2026-12-24T00:00:00.000Z";
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await wait(300);
    expect(host.querySelector(".needt-task-due-label")?.textContent).toMatch(
      /^Dec 2[34]$/
    );
  });

  it("taking the item out of the page asks, and Delete moves the task to Trash", async () => {
    await mount();
    const editor = editorOf();
    const id = await typeTaskItem(editor, "Old idea");
    await wait(900);

    await act(async () => {
      editor.commands.selectAll();
      editor.commands.deleteSelection();
    });
    await wait(50);
    const dialog = document.querySelector("[data-task-removal]")!;
    expect(dialog.textContent).toContain("Delete the task too?");
    expect(dialog.textContent).toContain("Old idea");
    const del = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Delete task"
    )!;
    await act(async () => {
      del.click();
    });
    await wait(50);
    expect(puts().at(-1)?.url).toBe(`/api/tasks/${id}`);
    expect(typeof puts().at(-1)?.body.trashedAt).toBe("string");
    expect(document.querySelector("[data-task-removal]")).toBeNull();
  });

  it("Keep leaves the task alone", async () => {
    await mount();
    const editor = editorOf();
    await typeTaskItem(editor, "Keep me");
    await wait(900);
    const before = puts().length;
    await act(async () => {
      editor.commands.selectAll();
      editor.commands.deleteSelection();
    });
    await wait(50);
    const dialog = document.querySelector("[data-task-removal]")!;
    const keep = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Keep task"
    )!;
    await act(async () => {
      keep.click();
    });
    await wait(50);
    expect(puts()).toHaveLength(before);
    expect([...tasks.values()][0].trashedAt).toBeNull();
    expect(document.querySelector("[data-task-removal]")).toBeNull();
  });

  it("a task deleted elsewhere unlinks the item, which stays as a plain checklist line", async () => {
    await mount();
    const editor = editorOf();
    const id = await typeTaskItem(editor, "Gone soon");
    await wait(900);
    tasks.get(id)!.trashedAt = "2026-10-17T10:00:00.000Z";
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await wait(300);
    expect(host.querySelector("li[data-needt-task-item]")).toBeNull();
    expect(editor.getText()).toContain("Gone soon");
    // No prompt: the page did not remove it.
    expect(document.querySelector("[data-task-removal]")).toBeNull();
  });
});

describe("the phone editing bar in the page", () => {
  it("is the page's bar, and its block menu's Task makes a task item", async () => {
    await mount();
    const editor = editorOf();
    const bar = document.querySelector("[aria-label='Page editing actions']");
    expect(bar).not.toBeNull();
    await act(async () => {
      editor.commands.insertContent("Draft");
    });
    const open = bar!.querySelector<HTMLButtonElement>(
      "button[aria-label='Block type']"
    )!;
    await act(async () => {
      open.click();
    });
    const task = bar!.querySelector<HTMLButtonElement>(
      "[data-block='taskItem']"
    )!;
    await act(async () => {
      task.click();
    });
    expect(host.querySelector("li[data-needt-task-item]")).not.toBeNull();
    await wait(900);
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({ title: "Draft" });
  });
});

describe("Export as PDF from a card menu", () => {
  it("opens the page, clears ?export=pdf from the address and prints once", async () => {
    window.history.replaceState(null, "", "/pages/p1?export=pdf#keep");
    const print = jest.spyOn(window, "print").mockImplementation(() => {});
    await mount();
    expect(print).not.toHaveBeenCalled();
    await wait(900);
    expect(print).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#keep");
    // Another look at the page does not print again.
    await act(async () => {
      editorOf().commands.insertContent("x");
    });
    await wait(900);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("a page opened without the request does not print", async () => {
    const print = jest.spyOn(window, "print").mockImplementation(() => {});
    await mount();
    await wait(900);
    expect(print).not.toHaveBeenCalled();
  });
});
