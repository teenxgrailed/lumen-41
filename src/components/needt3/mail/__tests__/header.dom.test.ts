/**
 * @jest-environment jsdom
 *
 * The desktop Mailbox header, mounted for real over a fake controller, in
 * every account state: chips with their status dot, the tab labels and
 * counts, New message (a link to the provider's compose window, never our own
 * composer), Sent and Drafts held with the reason, and the no-account state
 * with its way to Connections. Mail is read-only at the provider, so nothing
 * here may send, draft or write.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3MailThread } from "@/lib/needt3/map";

import { MailScreen } from "../MailScreen";
import type { Mailbox } from "../useMailbox";

jest.mock("@/components/needt3/root/V3Root", () => ({
  useDesignV3: () => true,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/mail", () => ({
  useThread: () => ({ isSuccess: false, data: undefined }),
}));
jest.mock("@/lib/needt3/hooks/mail-accounts", () => ({
  useMailRef: () => ({ data: undefined }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Acct = {
  id: string;
  provider: string;
  address: string;
  status: string;
  lastSyncAt: string | null;
};
const GMAIL: Acct = {
  id: "a1",
  provider: "GMAIL",
  address: "me@gmail.com",
  status: "ACTIVE",
  lastSyncAt: "2026-10-12T06:12:00.000Z",
};
const OUTLOOK_DOWN: Acct = {
  id: "a2",
  provider: "OUTLOOK",
  address: "me@outlook.com",
  status: "ERROR",
  lastSyncAt: "2026-10-12T06:12:00.000Z",
};

const thread = (id: string, over: Partial<V3MailThread> = {}) =>
  ({
    id,
    accountId: "a1",
    threadId: null,
    subject: `Subject ${id}`,
    from: `Sender ${id}`,
    fromEmail: `${id}@example.com`,
    receivedAt: "2026-10-12T09:12",
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

function fakeBox(
  over: {
    accounts?: Record<string, unknown>;
    live?: V3MailThread[];
    tab?: string;
  } = {}
) {
  const live = over.live ?? [thread("m1"), thread("m2")];
  const accounts = over.accounts ?? { isSuccess: true, data: [GMAIL] };
  const data = (accounts.data as Acct[] | undefined) ?? [];
  const box = {
    today: "2026-10-12",
    tz: "UTC",
    mail: {
      status: "success",
      fetchStatus: "idle",
      data: live,
      error: null,
      refetch: jest.fn(),
    },
    tasks: { data: [] },
    accounts: { isError: false, ...accounts },
    live,
    made: new Map(),
    madeServer: new Map(),
    list: live,
    counts: { needs: live.length, all: live.length, done: 0 },
    groups: live.length ? [{ day: "Today", rows: live }] : [],
    unread: live.length,
    down: data.filter((a) => a.status === "ERROR"),
    tab: over.tab ?? "needs",
    setTab: jest.fn(),
    openId: null,
    reading: false,
    setReading: jest.fn(),
    open: jest.fn(),
    archive: jest.fn(),
    makeTask: jest.fn(),
    takeBack: jest.fn(),
    toCalendar: jest.fn(),
    setRead: jest.fn(),
    trash: jest.fn(),
  };
  return box as unknown as Mailbox & typeof box;
}

let host: HTMLDivElement;
let root: Root;
const mount = (box: ReturnType<typeof fakeBox>) =>
  act(() => root.render(h(MailScreen, { box })));
const q = (sel: string) => host.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const text = (el: Element | null) => (el?.textContent ?? "").trim();

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

describe("one Gmail account connected", () => {
  it("draws a Gmail chip with no attention dot", () => {
    mount(fakeBox());
    const chips = qa("[data-ml-acct]");
    expect(chips.map((c) => c.dataset.mlAcct)).toEqual(["GMAIL"]);
    expect(chips[0].dataset.mlAcctState).toBe("ok");
    expect(text(chips[0])).toBe("Gmail");
    expect(chips[0].title).toBe("me@gmail.com");
    expect(chips[0].querySelector(".ml-acct-down")).toBeNull();
  });

  it("names the tabs and counts them, and holds Sent and Drafts", () => {
    mount(fakeBox());
    const tabs = qa("[data-ml-tab]");
    expect(tabs.map((t) => t.dataset.mlTab)).toEqual([
      "needs",
      "all",
      "done",
      "sent",
      "drafts",
    ]);
    expect(tabs.slice(0, 3).map(text)).toEqual([
      "Needs you2",
      "All2",
      "Made into tasks0",
    ]);
    const [sent, drafts] = tabs.slice(3);
    expect(text(sent)).toBe("Sent");
    expect(text(drafts)).toBe("Drafts");
    for (const held of [sent, drafts]) {
      expect(held.getAttribute("aria-disabled")).toBe("true");
      // no count: there is nothing to count, and no number is made up
      expect(held.querySelector(".ml-tab-n")).toBeNull();
    }
    expect(sent.title).toBe("Sent folder isn't synced yet");
    expect(drafts.title).toBe("Drafts folder isn't synced yet");
  });

  it("does nothing when a held tab is pressed", () => {
    const box = fakeBox();
    mount(box);
    act(() => {
      q("[data-ml-tab=sent]")!.click();
      q("[data-ml-tab=drafts]")!.click();
    });
    expect(box.setTab).not.toHaveBeenCalled();
    act(() => q("[data-ml-tab=all]")!.click());
    expect(box.setTab).toHaveBeenCalledWith("all");
  });

  it("opens Gmail's own compose window in a new tab", () => {
    mount(fakeBox());
    const a = q("[data-ml-new]") as HTMLAnchorElement;
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe(
      "https://mail.google.com/mail/u/me%40gmail.com/?view=cm&fs=1"
    );
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    expect(a.getAttribute("aria-label")).toBe("New message");
    expect(text(a)).toBe("New message");
    // no composer of our own
    expect(q("[data-ml-composer]")).toBeNull();
  });
});

describe("Gmail and Outlook, Outlook needs reconnecting", () => {
  const two = { isSuccess: true, data: [GMAIL, OUTLOOK_DOWN] };

  it("marks only the Outlook chip, saying since when", () => {
    mount(fakeBox({ accounts: two }));
    const [gm, ol] = qa("[data-ml-acct]");
    expect(gm.dataset.mlAcctState).toBe("ok");
    expect(ol.dataset.mlAcctState).toBe("down");
    expect(ol.querySelector(".ml-acct-down")).not.toBeNull();
    expect(ol.title).toBe("Disconnected since 06:12 — reconnect below");
  });

  it("asks which account to write from, then opens that provider's compose", () => {
    const open = jest.spyOn(window, "open").mockReturnValue(null);
    mount(fakeBox({ accounts: two }));
    const btn = q("[data-ml-new]")!;
    expect(btn.tagName).toBe("BUTTON");
    act(() => btn.click());
    const items = qa("[role=menuitem]");
    expect(items.map(text)).toEqual([
      "Gmailme@gmail.com",
      "Outlookme@outlook.com",
    ]);
    act(() => items[1].click());
    expect(open).toHaveBeenCalledWith(
      "https://outlook.office.com/mail/deeplink/compose",
      "_blank",
      "noopener,noreferrer"
    );
  });
});

describe("no account connected", () => {
  const none = { isSuccess: true, data: [] };

  it("draws Gmail and Outlook as not connected, linking to Connections", () => {
    mount(fakeBox({ accounts: none, live: [] }));
    const chips = qa("[data-ml-acct]") as HTMLAnchorElement[];
    expect(chips.map((c) => c.dataset.mlAcct)).toEqual(["GMAIL", "OUTLOOK"]);
    for (const c of chips) {
      expect(c.dataset.mlAcctState).toBe("missing");
      expect(c.getAttribute("href")).toBe("/connections");
      expect(c.querySelector(".ml-acct-down")).not.toBeNull();
    }
    expect(chips[0].title).toBe(
      "Gmail isn't connected — connect it in Connections"
    );
  });

  it("keeps the tabs, and the header is never empty", () => {
    mount(fakeBox({ accounts: none, live: [] }));
    expect(qa("[data-ml-tab]")).toHaveLength(5);
    expect(text(q(".ml-head"))).toContain("Mailbox");
  });

  it("draws New message disabled, with the reason", () => {
    mount(fakeBox({ accounts: none, live: [] }));
    const btn = q("[data-ml-new]")!;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.title).toBe("Connect a mail account to write");
    expect(btn.getAttribute("href")).toBeNull();
  });

  it("says no account is connected, with a way to Connections, on any tab", () => {
    mount(fakeBox({ accounts: none, live: [], tab: "needs" }));
    expect(q("[data-ml-list]")!.dataset.mlEmpty).toBe("no-account");
    expect(text(q(".ml-empty-title"))).toBe("No mail account connected");
    expect(text(q(".ml-empty-line"))).toBe(
      "Connect Gmail or Outlook and your mail shows up here."
    );
    const cta = q(".ml-empty-cta") as HTMLAnchorElement;
    expect(text(cta)).toBe("Open Connections");
    expect(cta.getAttribute("href")).toBe("/connections");
    expect(q(".ml-empty svg")).not.toBeNull();
  });
});

describe("accounts but an empty inbox", () => {
  it("keeps the real chip and says Inbox zero on Needs you", () => {
    mount(fakeBox({ live: [], tab: "needs" }));
    expect(qa("[data-ml-acct]").map((c) => c.dataset.mlAcctState)).toEqual([
      "ok",
    ]);
    expect(text(q(".ml-empty-title"))).toBe("Inbox zero");
    expect(q("[data-ml-new]")!.tagName).toBe("A");
  });
});

describe("accounts still loading, or failed", () => {
  it("draws no chips and does not claim there is no account", () => {
    mount(
      fakeBox({
        accounts: { isSuccess: false, data: undefined },
        live: [],
        tab: "needs",
      })
    );
    expect(qa("[data-ml-acct]")).toHaveLength(0);
    // an empty list, but not the "nothing connected" one: that waits for the answer
    expect(q("[data-ml-list]")!.dataset.mlEmpty).toBe("needs");
    expect(text(q(".ml-empty-title"))).toBe("Inbox zero");
    const btn = q("[data-ml-new]")!;
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.title).toBe("Loading your mail accounts");
    expect(qa("[data-ml-tab]")).toHaveLength(5);
  });

  it("says why New message is off when the accounts failed to load", () => {
    mount(
      fakeBox({
        accounts: { isSuccess: false, isError: true, data: undefined },
      })
    );
    expect(q("[data-ml-new]")!.title).toBe("Couldn't load your mail accounts");
  });
});
