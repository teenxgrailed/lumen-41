/**
 * @jest-environment jsdom
 *
 * The phone Mailbox, mounted for real over a fake controller: a swipe right
 * archives, a swipe left makes a task, a cancelled swipe commits nothing, a
 * second finger is ignored, a row that already became a task has no left
 * swipe, and nothing on the screen sends, drafts or trashes.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { V3MailThread } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import type { Mailbox } from "../../../mail/useMailbox";
import { PkTheme } from "../../kit";
import { pkAbortGestures } from "../../kit/pointer";
import { PhoneMail } from "../PhoneMail";

jest.mock("@/components/needt3/root/V3Root", () => ({
  useDesignV3: () => true,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const thread = (id: string, over: Partial<V3MailThread> = {}): V3MailThread =>
  ({
    id,
    accountId: "a1",
    threadId: null,
    subject: `Subject ${id}`,
    from: `Sender ${id}`,
    fromEmail: `${id}@example.com`,
    receivedAt: "2026-10-11T09:12",
    preview: "preview",
    isRead: false,
    isArchived: false,
    trashedAt: null,
    needsReply: true,
    suggestedTask: null,
    to: [],
    cc: [],
    bcc: [],
    attachments: [],
    ...over,
  }) as V3MailThread;

function fakeBox(over: Partial<Record<string, unknown>> = {}) {
  const live = (over.live as V3MailThread[]) ?? [thread("m1"), thread("m2")];
  const made = (over.made as Map<string, string>) ?? new Map();
  const box = {
    today: "2026-10-11",
    tz: "UTC",
    mail: {
      status: "success",
      fetchStatus: "idle",
      data: live,
      error: null,
      refetch: jest.fn(),
    },
    tasks: {},
    accounts: { isSuccess: true, data: [{ id: "a1" }] },
    live,
    made,
    madeServer: made,
    list: live,
    counts: { needs: live.length, all: live.length, done: 0 },
    groups: [{ day: "Today", rows: live }],
    unread: live.filter((m) => !m.isRead).length,
    down: [],
    tab: "needs",
    setTab: jest.fn(),
    readOpen: false,
    toggleReadOpen: jest.fn(),
    openId: null,
    open: jest.fn(),
    close: jest.fn(),
    archive: jest.fn<Promise<void>, [V3MailThread]>(async () => undefined),
    makeTask: jest.fn<Promise<void>, [V3MailThread, string]>(
      async () => undefined
    ),
    takeBack: jest.fn(async () => undefined),
    toCalendar: jest.fn(async () => undefined),
    toggleRead: jest.fn(async () => undefined),
    syncNow: jest.fn(async () => undefined),
    syncing: false,
    ...over,
  };
  return box as unknown as Mailbox & typeof box;
}

function pointer(
  type: string,
  props: { x?: number; y?: number; id?: number } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: props.x ?? 0,
    clientY: props.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: props.id ?? 1 });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  return e;
}
const fire = (el: Element | Window, type: string, p = {}) =>
  act(() => {
    el.dispatchEvent(pointer(type, p));
  });

let host: HTMLDivElement;
let root: Root;

const mount = (box: Mailbox) => {
  const qc = new QueryClient();
  qc.setQueryData([...qk.mail(), "accounts"], []);
  act(() =>
    root.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(PkTheme.Provider, { value: "light" }, h(PhoneMail, { box }))
      )
    )
  );
};
const row = (id: string) =>
  host.querySelector<HTMLElement>(`[data-pml-row="${id}"] .pk-row-open`)!;

beforeEach(() => {
  // reduced motion: the exit commits at once, without the fold timers
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

describe("swipes", () => {
  it("right archives that message", () => {
    const box = fakeBox();
    mount(box);
    fire(row("m1"), "pointerdown", { x: 10, y: 10 });
    fire(window, "pointermove", { x: 140, y: 12 });
    fire(window, "pointerup", { x: 140, y: 12 });
    expect(box.archive).toHaveBeenCalledTimes(1);
    expect(box.archive.mock.calls[0][0].id).toBe("m1");
    expect(box.makeTask).not.toHaveBeenCalled();
  });

  it("left makes a task for later from that message", () => {
    const box = fakeBox();
    mount(box);
    fire(row("m2"), "pointerdown", { x: 200, y: 10 });
    fire(window, "pointermove", { x: 60, y: 12 });
    fire(window, "pointerup", { x: 60, y: 12 });
    expect(box.makeTask).toHaveBeenCalledTimes(1);
    expect(box.makeTask.mock.calls[0][0].id).toBe("m2");
    expect(box.makeTask.mock.calls[0][1]).toBe("later");
    expect(box.archive).not.toHaveBeenCalled();
  });

  it("a cancelled swipe commits nothing, either way", () => {
    const box = fakeBox();
    mount(box);
    fire(row("m1"), "pointerdown", { x: 10, y: 10 });
    fire(window, "pointermove", { x: 140, y: 12 });
    fire(window, "pointercancel", { x: 0, y: 0 });
    fire(row("m2"), "pointerdown", { x: 200, y: 10 });
    fire(window, "pointermove", { x: 60, y: 12 });
    act(() => pkAbortGestures(1));
    fire(window, "pointerup", { x: 60, y: 12 });
    expect(box.archive).not.toHaveBeenCalled();
    expect(box.makeTask).not.toHaveBeenCalled();
  });

  it("a second finger is ignored and another finger lifting ends nothing", () => {
    const box = fakeBox();
    mount(box);
    fire(row("m1"), "pointerdown", { x: 10, y: 10, id: 1 });
    fire(row("m1"), "pointerdown", { x: 300, y: 10, id: 2 });
    fire(window, "pointermove", { x: 140, y: 12, id: 1 });
    fire(window, "pointerup", { x: 5, y: 5, id: 2 });
    expect(box.archive).not.toHaveBeenCalled();
    fire(window, "pointerup", { x: 140, y: 12, id: 1 });
    expect(box.archive).toHaveBeenCalledTimes(1);
  });

  it("a row that already became a task has no left swipe", () => {
    const box = fakeBox({ made: new Map([["m1", "t1"]]) });
    mount(box);
    fire(row("m1"), "pointerdown", { x: 200, y: 10 });
    fire(window, "pointermove", { x: 40, y: 12 });
    fire(window, "pointerup", { x: 40, y: 12 });
    expect(box.makeTask).not.toHaveBeenCalled();
    expect(
      host.querySelector('[data-pml-row="m1"] .pml-tag')?.textContent
    ).toContain("Task");
  });

  it("unmounting mid-swipe releases the listeners and commits nothing", () => {
    const box = fakeBox();
    mount(box);
    fire(row("m1"), "pointerdown", { x: 10, y: 10 });
    fire(window, "pointermove", { x: 140, y: 12 });
    act(() => root.unmount());
    window.dispatchEvent(pointer("pointerup", { x: 140, y: 12 }));
    expect(box.archive).not.toHaveBeenCalled();
    // remount so afterEach can unmount a live root
    root = createRoot(host);
  });
});

describe("what is on the screen", () => {
  it("rows show the sender, subject and an unread mark", () => {
    const box = fakeBox({
      live: [thread("m1"), thread("m2", { isRead: true })],
    });
    mount(box);
    expect(
      host.querySelector('[data-pml-row="m1"]')?.getAttribute("data-pml-unread")
    ).toBe("1");
    expect(
      host.querySelector('[data-pml-row="m2"]')?.getAttribute("data-pml-unread")
    ).toBe("0");
    expect(host.textContent).toContain("Sender m1");
    expect(host.textContent).toContain("Subject m2");
    expect(host.textContent).toContain("1");
    expect(host.textContent).toContain("unread");
  });

  it("a long subject and the Task chip share the meta line; the full text stays in the label", () => {
    const long =
      "Re: Fwd: Quarterly planning offsite logistics, travel budget and the revised agenda for everyone";
    const box = fakeBox({
      live: [thread("m1", { subject: long })],
      made: new Map([["m1", "t1"]]),
    });
    mount(box);
    const open = row("m1");
    const meta = open.querySelector(".pk-row-meta")!;
    expect([...meta.children].map((c) => c.className)).toEqual([
      "pml-tag",
      "pml-subject",
    ]);
    expect(meta.querySelector(".pml-subject")?.textContent).toBe(long);
    expect(open.querySelector(".pk-row-title")?.textContent).toBe("Sender m1");
    expect(open.getAttribute("aria-label")).toContain(long);
  });

  it("offers no send, draft or trash anywhere", () => {
    const box = fakeBox();
    mount(box);
    const text = host.textContent ?? "";
    expect(text).not.toMatch(/\b(Send|Drafts?|Trash|New message|Compose)\b/);
    expect(host.querySelector("[data-pml-new]")).toBeNull();
  });

  it("no mail account → Connections link, not a bare empty line", () => {
    const box = fakeBox({
      live: [],
      list: [],
      groups: [],
      counts: { needs: 0, all: 0, done: 0 },
      accounts: { isSuccess: true, data: [] },
    });
    mount(box);
    const a = host.querySelector<HTMLAnchorElement>("[data-pml-connect]")!;
    expect(a.getAttribute("href")).toBe("/connections");
    expect(host.textContent).toContain("No mail account connected");
  });

  it("a failed load shows the error with Retry; Retry refetches", () => {
    const refetch = jest.fn();
    const box = fakeBox({
      mail: {
        status: "error",
        fetchStatus: "idle",
        data: undefined,
        error: new Error("down"),
        refetch,
      },
    });
    mount(box);
    expect(host.querySelector("[data-st-error]")).not.toBeNull();
    act(() => {
      host
        .querySelector<HTMLElement>("[data-st-retry]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a disconnected account gets a Reconnect line", () => {
    const box = fakeBox({
      down: [
        {
          id: "a1",
          provider: "OUTLOOK",
          address: "me@work.com",
          status: "ERROR",
          lastSyncAt: "2026-10-11T06:12:00.000Z",
          unread: 0,
        },
      ],
    });
    mount(box);
    const b = host.querySelector("[data-pml-banner]")!;
    expect(b.textContent).toContain("Outlook disconnected");
    expect(b.textContent).toContain("06:12");
    expect(b.querySelector("[data-pml-reconnect]")?.getAttribute("href")).toBe(
      "/api/mail/oauth/outlook/auth"
    );
  });

  it("Sync asks the controller once", () => {
    const box = fakeBox();
    mount(box);
    act(() => {
      host
        .querySelector<HTMLElement>("[data-pml-sync]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(box.syncNow).toHaveBeenCalledTimes(1);
  });
});
