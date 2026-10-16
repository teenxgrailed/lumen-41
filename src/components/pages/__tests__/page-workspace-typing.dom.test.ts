/**
 * @jest-environment jsdom
 *
 * What typing costs in the page editor. Measured as counts, which is what
 * made the opened document lag:
 *  - a collaborator's caret moving (awareness "change" fires on EVERY
 *    keystroke, the local cursor is part of it) must not re-render the
 *    workspace or re-apply the editor's configuration (`setOptions`);
 *  - a title keystroke re-renders it, and must not re-apply the editor's
 *    configuration either (the extension list and editor props are stable);
 *  - the whole page is serialised (`getJSON`) once per pause, not per key;
 *  - the Docs grid is told the page's first lines after a pause and as the
 *    page is left.
 */
import { act, createElement as h } from "react";

import { Editor } from "@tiptap/core";
import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import {
  PAGE_PREVIEW_EVENT,
  type PagePreviewDetail,
} from "@/lib/needt3/page-events";

import { PageWorkspace } from "../PageWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Awareness = {
  emit: (name: string, payload: unknown) => void;
  destroy: () => void;
};
const mockProviders: Awareness[] = [];

jest.mock("@hocuspocus/provider", () => {
  const actual = jest.requireActual("@hocuspocus/provider");
  // The real provider, remembered so a test can make it announce awareness.
  class Spied extends actual.HocuspocusProvider {
    constructor(config: unknown) {
      super(config);
      mockProviders.push(this as unknown as Awareness);
    }
  }
  return { ...actual, HocuspocusProvider: Spied };
});
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

const page = {
  id: "p1",
  parentId: null,
  title: "Buy-list",
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
  blocks: [],
  children: [],
};

let host: HTMLDivElement;
let root: Root;
let previews: PagePreviewDetail[];
const onPreview = (e: Event) =>
  previews.push((e as CustomEvent<PagePreviewDetail>).detail);

beforeEach(() => {
  mockProviders.length = 0;
  previews = [];
  localStorage.clear();
  (global as unknown as { fetch: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/pages/p1" && method === "GET")
        return reply(200, { page });
      if (url.endsWith("/collaboration-token")) return reply(404, {});
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
  window.addEventListener(PAGE_PREVIEW_EVENT, onPreview);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  window.removeEventListener(PAGE_PREVIEW_EVENT, onPreview);
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
  await wait(40);
};

const editorOf = () =>
  (
    host.querySelector(".needt-page-editor") as
      | (HTMLElement & { editor: Editor })
      | null
  )?.editor as Editor;

const typeTitle = async (value: string) => {
  const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "input[placeholder=Untitled], textarea[placeholder=Untitled]"
  )!;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const people = [
  { user: { name: "Lena", color: "#4F46E5" }, clientId: 1 },
  { user: { name: "Ivo", color: "#0EA5E9" }, clientId: 2 },
];

describe("typing in the page editor", () => {
  it("a collaborator moving their caret does not re-render or reconfigure the editor", async () => {
    await mount();
    const setOptions = jest.spyOn(Editor.prototype, "setOptions");
    const provider = mockProviders[0];

    await act(async () => {
      provider.emit("awarenessChange", { states: people });
    });
    const afterFirst = setOptions.mock.calls.length;
    for (let i = 0; i < 25; i += 1) {
      await act(async () => {
        // The same two people, the carets elsewhere: a keystroke's worth.
        provider.emit("awarenessChange", {
          states: people.map((p) => ({ ...p, cursor: { anchor: i } })),
        });
      });
    }

    expect(setOptions.mock.calls.length).toBe(afterFirst);
  });

  it("a new person arriving still shows", async () => {
    await mount();
    const provider = mockProviders[0];
    await act(async () => {
      provider.emit("awarenessChange", { states: people.slice(0, 1) });
    });
    expect(host.querySelectorAll('[title="Lena"]')).toHaveLength(1);
    await act(async () => {
      provider.emit("awarenessChange", { states: people });
    });
    expect(host.querySelectorAll('[title="Ivo"]')).toHaveLength(1);
  });

  it("a title keystroke re-renders the workspace without reconfiguring the editor", async () => {
    await mount();
    const setOptions = jest.spyOn(Editor.prototype, "setOptions");
    for (const t of ["B", "Bu", "Buy", "Buy-", "Buy-l"]) await typeTitle(t);
    expect(setOptions).not.toHaveBeenCalled();
  });

  it("serialises the page once per pause, not once per keystroke", async () => {
    await mount();
    const getJSON = jest.spyOn(Editor.prototype, "getJSON");
    const editor = editorOf();
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        editor.commands.insertContent("x");
      });
    }
    expect(getJSON).not.toHaveBeenCalled();

    await wait(1_000);
    // One read serves the recovery draft and the save of that revision.
    expect(getJSON.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("tells the Docs grid what the first lines are now: a checklist counts", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.setContent(
        {
          type: "doc",
          content: [
            { type: "paragraph" },
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Milk" }],
                    },
                  ],
                },
                {
                  type: "taskItem",
                  attrs: { checked: true },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Eggs" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { emitUpdate: true }
      );
    });
    expect(previews).toHaveLength(0); // not on every change
    await wait(700);
    expect(previews).toHaveLength(1);
    expect(previews[0]).toEqual({
      pageId: "p1",
      preview: [
        { type: "todo", text: "Milk" },
        { type: "todo", text: "Eggs", checked: true },
      ],
    });
  });

  it("sends the pending lines as the page is left", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("Last words");
    });
    expect(previews).toHaveLength(0);
    act(() => root.unmount());
    expect(previews).toHaveLength(1);
    expect(previews[0].preview).toEqual([{ type: "p", text: "Last words" }]);
    root = createRoot(host);
  });
});
