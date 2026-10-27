/**
 * @jest-environment jsdom
 *
 * The bell's panel: rows from the feed with unread dots, a row goes to its
 * link and is marked read, "Mark all as read", the options menu, the
 * Reminders tab and the empty state.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { FeedItem, FeedPage } from "@/lib/needt3/hooks/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { NotesPanel } from "../TopIcons";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const markRead = jest.fn();
const refetch = jest.fn();
const pages: Record<string, FeedPage | undefined> = {};
const fetchEarlier = jest.fn();
jest.mock("@/lib/needt3/hooks/notifications", () => ({
  useNotificationFeed: (group: string) => ({
    data: pages[group],
    refetch,
  }),
  useMarkNotificationsRead: () => markRead,
  useSnoozeNotifications: () => snoozeRows,
  fetchEarlier: (before: string) => fetchEarlier(before),
}));
const snoozeRows = jest.fn();
const reminderActions = {
  create: jest.fn(),
  update: jest.fn(),
  snooze: jest.fn(),
  remove: jest.fn(),
};
jest.mock("@/lib/needt3/hooks/reminders", () => ({
  ...jest.requireActual("@/lib/needt3/hooks/reminders"),
  useReminderActions: () => reminderActions,
}));
const updateTask = jest.fn().mockResolvedValue({});
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  useUpdateTask: () => ({ mutateAsync: updateTask }),
}));

const item = (over: Partial<FeedItem>): FeedItem => ({
  key: "nudge:1",
  group: "activity",
  kind: "nudge",
  actor: null,
  title: "3 tasks overdue",
  body: "Catch up today",
  at: new Date(Date.now() - 5 * 60_000).toISOString(),
  link: "/today",
  unread: true,
  ...over,
});

let host: HTMLDivElement;
let root: Root;
const close = jest.fn();

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(NotesPanel, { close })));
}

const rows = () =>
  Array.from(host.querySelectorAll<HTMLElement>("[data-kind]"));
const openOf = (row: HTMLElement) =>
  row.querySelector<HTMLButtonElement>(".shell-note-open") as HTMLButtonElement;
const act_ = (row: HTMLElement, label: string) =>
  row.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const byText = (text: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    b.textContent?.includes(text)
  );

beforeEach(() => {
  jest.clearAllMocks();
  pages.activity = undefined;
  pages.reminders = undefined;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("NotesPanel", () => {
  it("lists rows with unread dots, bolds the person and goes to the link", () => {
    pages.activity = {
      unreadCount: 1,
      nextBefore: null,
      items: [
        item({
          key: "comment:1",
          kind: "comment",
          actor: "Lena Fischer",
          title: "Lena Fischer commented on Design rules",
          body: "Agreed",
          link: "/pages/p1",
        }),
        item({ key: "nudge:2", unread: false, title: "Free time today" }),
      ],
    };
    mount();
    const list = rows();
    expect(list).toHaveLength(2);
    expect(list[0].querySelector("b")?.textContent).toBe("Lena Fischer");
    expect(list[0].textContent).toContain("commented on Design rules");
    expect(list[0].textContent).toContain("Agreed");
    expect(
      list.map((r) =>
        r.querySelector("[data-unread-dot]")?.getAttribute("data-unread-dot")
      )
    ).toEqual(["true", "false"]);

    act(() => openOf(list[0]).click());
    expect(markRead).toHaveBeenCalledWith(["comment:1"]);
    expect(push).toHaveBeenCalledWith("/pages/p1");
    expect(close).toHaveBeenCalled();
  });

  it("does not mark a read row again, and never follows an off-site link", () => {
    pages.activity = {
      unreadCount: 0,
      nextBefore: null,
      items: [item({ unread: false, link: "https://evil.example" })],
    };
    mount();
    act(() => openOf(rows()[0]).click());
    expect(markRead).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/today");
  });

  it("keeps the empty state when there is nothing", () => {
    pages.activity = { unreadCount: 0, nextBefore: null, items: [] };
    mount();
    expect(host.textContent).toContain("No notifications yet");
    expect(rows()).toHaveLength(0);
  });

  it("the options menu marks all read, reloads and opens Settings -> Notifications", () => {
    pages.activity = { unreadCount: 0, nextBefore: null, items: [] };
    mount();
    const open = () =>
      act(() =>
        host
          .querySelector<HTMLButtonElement>(
            '[aria-label="Notification options"]'
          )
          ?.click()
      );
    open();
    act(() => byText("Mark all as read")?.click());
    expect(markRead).toHaveBeenCalledWith("all");

    open();
    act(() => byText("Reload notifications")?.click());
    expect(refetch).toHaveBeenCalled();

    open();
    act(() => byText("Notification settings")?.click());
    expect(useNeedt3Ui.getState().settingsSection).toBe("alerts");
    expect(close).toHaveBeenCalled();
  });

  it("shows older rows on request", async () => {
    pages.activity = {
      unreadCount: 0,
      nextBefore: "2026-10-15T00:00:00.000Z",
      items: [item({ key: "nudge:1", unread: false })],
    };
    fetchEarlier.mockResolvedValue({
      unreadCount: 0,
      nextBefore: null,
      items: [item({ key: "nudge:0", unread: false, title: "Older one" })],
    });
    mount();
    await act(async () => byText("Show earlier")?.click());
    expect(fetchEarlier).toHaveBeenCalledWith("2026-10-15T00:00:00.000Z");
    expect(rows()).toHaveLength(2);
    expect(byText("Show earlier")).toBeUndefined();
  });

  it("the Reminders tab lists what is coming and has its own empty state", () => {
    pages.activity = { unreadCount: 0, nextBefore: null, items: [] };
    pages.reminders = {
      unreadCount: 0,
      nextBefore: null,
      items: [
        item({
          key: "due:t1",
          group: "reminders",
          kind: "due",
          title: "Pay rent",
          body: "Due soon",
          at: new Date(Date.now() + 86_400_000).toISOString(),
          link: "/today?task=t1",
          unread: false,
        }),
      ],
    };
    mount();
    act(() => byText("Reminders")?.click());
    expect(host.textContent).toContain("Pay rent");
    expect(host.textContent).toContain("Tomorrow");
    act(() => openOf(rows()[0]).click());
    expect(push).toHaveBeenCalledWith("/today?task=t1");
    expect(markRead).not.toHaveBeenCalled();

    pages.reminders = { unreadCount: 0, nextBefore: null, items: [] };
    act(() => root.render(h(NotesPanel, { close })));
    expect(host.textContent).toContain("No reminders");
  });

  it("shows a quiet type glyph instead of the drawing", () => {
    pages.activity = {
      unreadCount: 0,
      nextBefore: null,
      items: [
        item({ key: "comment:1", kind: "comment", actor: "Lena" }),
        item({ key: "sync:1", kind: "sync" }),
        item({ key: "nudge:1", kind: "nudge" }),
      ],
    };
    mount();
    expect(
      rows().map((r) =>
        r.querySelector(".shell-note-icon")?.getAttribute("data-type")
      )
    ).toEqual(["mention", "event", "system"]);
    expect(host.querySelector("[data-art]")).toBeNull();
  });

  it("folds overdue tasks into one row that expands, with Tomorrow for all", () => {
    const overdue = (id: string, minutesAgo: number) =>
      item({
        key: `overdue:${id}:1`,
        kind: "overdue",
        title: `Task ${id}`,
        body: "Overdue",
        at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
        entity: { type: "task", id },
      });
    pages.activity = {
      unreadCount: 3,
      nextBefore: null,
      items: [overdue("a", 60), overdue("b", 120), overdue("c", 600)],
    };
    mount();
    expect(rows()).toHaveLength(1);
    expect(host.textContent).toContain("3 tasks overdue");
    act(() => openOf(rows()[0]).click());
    expect(push).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(4);

    act(() => act_(rows()[0], "Tomorrow")?.click());
    expect(snoozeRows).toHaveBeenCalledWith(
      ["overdue:a:1", "overdue:b:1", "overdue:c:1"],
      expect.any(Date)
    );
    const until = snoozeRows.mock.calls[0][1] as Date;
    expect(until.getHours()).toBe(9);
    expect(until.getMinutes()).toBe(0);
  });

  it("Done completes the task behind a row; Tomorrow snoozes a reminder", async () => {
    pages.activity = {
      unreadCount: 2,
      nextBefore: null,
      items: [
        item({
          key: "fired:r1:1",
          kind: "reminder",
          title: "Send the invoice",
          entity: { type: "task", id: "t1" },
          reminderId: "r1",
        }),
      ],
    };
    mount();
    await act(async () => act_(rows()[0], "Done")?.click());
    expect(updateTask).toHaveBeenCalledWith({
      id: "t1",
      patch: { done: true },
    });
    expect(markRead).toHaveBeenCalledWith(["fired:r1:1"]);
    expect(push).not.toHaveBeenCalled();

    act(() => act_(rows()[0], "Tomorrow")?.click());
    expect(reminderActions.snooze).toHaveBeenCalledWith("r1", expect.any(Date));
    expect(snoozeRows).not.toHaveBeenCalled();
  });

  it("offers Mark all read in the header only while something is unread", () => {
    pages.activity = { unreadCount: 1, nextBefore: null, items: [item({})] };
    mount();
    act(() => byText("Mark all read")?.click());
    expect(markRead).toHaveBeenCalledWith("all");
    pages.activity = {
      unreadCount: 0,
      nextBefore: null,
      items: [item({ unread: false })],
    };
    act(() => root.render(h(NotesPanel, { close })));
    expect(byText("Mark all read")).toBeUndefined();
  });

  it("edits, snoozes and deletes a reminder from the Reminders tab", () => {
    pages.activity = { unreadCount: 0, nextBefore: null, items: [] };
    pages.reminders = {
      unreadCount: 0,
      nextBefore: null,
      items: [
        item({
          key: "reminder:r1",
          group: "reminders",
          kind: "reminder",
          title: "Call the tax office",
          body: "10 min before",
          at: new Date(Date.now() + 3_600_000).toISOString(),
          unread: false,
          entity: { type: "task", id: "t1" },
          reminderId: "r1",
        }),
      ],
    };
    mount();
    act(() => byText("Reminders")?.click());
    const row = rows()[0];
    act(() => act_(row, "Tomorrow")?.click());
    expect(reminderActions.snooze).toHaveBeenCalledWith("r1", expect.any(Date));
    act(() => act_(row, "Delete reminder")?.click());
    expect(reminderActions.remove).toHaveBeenCalledWith("r1");
    act(() => act_(row, "Edit reminder")?.click());
    act(() => byText("1 hour before")?.click());
    expect(reminderActions.update).toHaveBeenCalledWith("r1", {
      offsetMinutes: 60,
    });
  });
});
