/**
 * @jest-environment jsdom
 *
 * PageWorkspace inside and outside the v3 frame. Outside (the old shell) it
 * adds nothing: no data attributes, no extra span, no window listeners, no
 * announcements. Inside, a title write is announced to the chrome, a failed
 * write is announced back to what the server holds, a title still unsent when
 * the page goes away is sent, and a database page takes no Insert commands.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import {
  PAGE_PATCHED_EVENT,
  type PagePatchedDetail,
} from "@/lib/needt3/page-events";

import { PageWorkspace } from "../PageWorkspace";
import { setDocHeadSlot } from "../doc-head-slot";
import { PAGE_COMMAND_EVENT, PAGE_TOOL_EVENT } from "../page-commands";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => {
  // One object: the editor reloads the page whenever the router changes.
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

const page = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  parentId: null,
  title: "Launch",
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
  ...extra,
});

type Call = { url: string; method: string; body?: string; keepalive?: boolean };
let calls: Call[];
let patchOk: boolean;
let loaded: ReturnType<typeof page>;
let host: HTMLDivElement;
let root: Root;
let patched: PagePatchedDetail[];
const onPatched = (e: Event) =>
  patched.push((e as CustomEvent<PagePatchedDetail>).detail);

const reply = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  calls = [];
  patched = [];
  patchOk = true;
  loaded = page();
  (global as unknown as { fetch: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit & { keepalive?: boolean }) => {
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body as string | undefined,
        keepalive: init?.keepalive,
      });
      if (url === "/api/pages/p1" && method === "GET")
        return reply(200, { page: loaded });
      if (url === "/api/pages/p1" && method === "PATCH")
        return reply(patchOk ? 200 : 500, {});
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
  window.addEventListener(PAGE_PATCHED_EVENT, onPatched);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  window.removeEventListener(PAGE_PATCHED_EVENT, onPatched);
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

const mount = async (v3: boolean) => {
  const el = h(PageWorkspace, { pageId: "p1" });
  await act(async () => {
    root.render(v3 ? h(V3PortalScope, null, el) : el);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
};
const title = () =>
  host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "input[placeholder=Untitled], textarea[placeholder=Untitled]"
  )!;
const type = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const blur = () =>
  act(async () => {
    title().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
const patchCalls = () => calls.filter((c) => c.method === "PATCH");

describe("PageWorkspace outside the v3 frame", () => {
  it("draws the old markup and announces nothing", async () => {
    await mount(false);
    expect(host.querySelector("[data-page-meta]")).toBeNull();
    expect(host.querySelector("[data-page-edited]")).toBeNull();
    expect(host.querySelector("[data-page-title]")).toBeNull();
    expect(host.querySelector("[data-collab]")).toBeNull();
    expect(host.textContent).toMatch(/Edited /);
    await type(title(), "Renamed");
    await blur();
    expect(patchCalls()).toHaveLength(1);
    expect(patched).toEqual([]);
  });

  it("listens for no Insert command and no tool request", async () => {
    const add = jest.spyOn(window, "addEventListener");
    await mount(false);
    const names = add.mock.calls.map((c) => c[0]);
    expect(names).not.toContain(PAGE_COMMAND_EVENT);
    expect(names).not.toContain(PAGE_TOOL_EVENT);
    expect(names).not.toContain(PAGE_PATCHED_EVENT);
  });

  it("sends nothing extra when the page goes away with a typed title", async () => {
    await mount(false);
    await type(title(), "Typed, not blurred");
    act(() => root.unmount());
    expect(patchCalls()).toHaveLength(0);
    root = createRoot(host);
  });
});

describe("PageWorkspace inside the v3 frame", () => {
  it("marks its title and meta row, and announces each keystroke", async () => {
    await mount(true);
    expect(host.querySelector("[data-page-meta]")).not.toBeNull();
    expect(host.querySelector("[data-page-edited]")).not.toBeNull();
    await type(title(), "Launch 2");
    expect(patched.map((p) => p.values)).toEqual([{ title: "Launch 2" }]);
  });

  it("announces the saved title back when the write fails", async () => {
    await mount(true);
    patchOk = false;
    await type(title(), "Not saved");
    await blur();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(patched[patched.length - 1].values).toEqual({ title: "Launch" });
  });

  it("sends a title still unsent when the page goes away", async () => {
    await mount(true);
    await type(title(), "Typed, not blurred");
    expect(patchCalls()).toHaveLength(0);
    act(() => root.unmount());
    const sent = patchCalls();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].body!)).toEqual({ title: "Typed, not blurred" });
    expect(sent[0].keepalive).toBe(true);
    root = createRoot(host);
  });

  it("does not send a title that was already written on blur", async () => {
    await mount(true);
    await type(title(), "Written");
    await blur();
    expect(patchCalls()).toHaveLength(1);
    act(() => root.unmount());
    expect(patchCalls()).toHaveLength(1);
    root = createRoot(host);
  });

  it("takes the chrome's pin into its own copy of the page", async () => {
    await mount(true);
    const star = () =>
      document.body
        .querySelector(
          '[aria-label="Remove from favorites"], [aria-label="Add to favorites"]'
        )
        ?.getAttribute("aria-label");
    await act(async () => {
      host
        .querySelector<HTMLElement>('[aria-label="Page options"]')
        ?.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        );
      host.querySelector<HTMLElement>('[aria-label="Page options"]')?.click();
    });
    expect(star()).toBe("Add to favorites");
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(PAGE_PATCHED_EVENT, {
          detail: {
            pageId: "p1",
            values: { isFavorite: true },
            from: "chrome",
          },
        })
      );
    });
    expect(star()).toBe("Remove from favorites");
    // Taking it is not a write of its own.
    expect(patchCalls()).toHaveLength(0);
  });

  it("a database page keeps no Insert command listener once it has loaded", async () => {
    loaded = page({ database: { id: "d1" } });
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");
    await mount(true);
    const live = (name: string) =>
      add.mock.calls.filter((c) => c[0] === name).length -
      remove.mock.calls.filter((c) => c[0] === name).length;
    expect(live(PAGE_COMMAND_EVENT)).toBe(0);
    expect(live(PAGE_TOOL_EVENT)).toBe(0);
  });

  it("a text page keeps both listeners", async () => {
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");
    await mount(true);
    const live = (name: string) =>
      add.mock.calls.filter((c) => c[0] === name).length -
      remove.mock.calls.filter((c) => c[0] === name).length;
    expect(live(PAGE_COMMAND_EVENT)).toBe(1);
    expect(live(PAGE_TOOL_EVENT)).toBe(1);
  });

  it("sends the typed title when the chrome swaps its title field", async () => {
    await mount(true);
    expect(title().tagName).toBe("INPUT");
    await type(title(), "Typed before the swap");
    expect(patchCalls()).toHaveLength(0);
    const status = document.createElement("span");
    const more = document.createElement("span");
    await act(async () => {
      setDocHeadSlot("status", status);
      setDocHeadSlot("more", more);
    });
    expect(title().tagName).toBe("TEXTAREA");
    expect(patchCalls().map((c) => JSON.parse(c.body!))).toEqual([
      { title: "Typed before the swap" },
    ]);
    await act(async () => {
      setDocHeadSlot("status", null);
      setDocHeadSlot("more", null);
    });
  });

  it("Enter in the chrome's title goes to the page, except an IME's Enter", async () => {
    const status = document.createElement("span");
    const more = document.createElement("span");
    setDocHeadSlot("status", status);
    setDocHeadSlot("more", more);
    await mount(true);
    const enter = (keyCode: number) => {
      const e = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(e, "keyCode", { value: keyCode });
      act(() => {
        title().dispatchEvent(e);
      });
      return e.defaultPrevented;
    };
    expect(title().tagName).toBe("TEXTAREA");
    expect(enter(229)).toBe(false);
    expect(enter(13)).toBe(true);
    await act(async () => {
      setDocHeadSlot("status", null);
      setDocHeadSlot("more", null);
    });
  });
});
