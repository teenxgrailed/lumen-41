/**
 * @jest-environment jsdom
 *
 * The shared controller, with the v3 hooks mocked: a task made from mail has
 * the mail as its origin, one write per message at a time (a double tap, or
 * a second face, repeats nothing), a failed write lets the row come back,
 * and archive closes the open message.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3MailThread } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { notices } from "../../../mail/strings";
import { type Mailbox, useMailbox } from "../../../mail/useMailbox";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const m1 = {
  id: "m1",
  subject: "Invoice 42",
  from: "Anna",
  receivedAt: "2026-10-11T09:12",
  isRead: false,
  isArchived: false,
  trashedAt: null,
  needsReply: true,
  suggestedTask: null,
} as unknown as V3MailThread;

const mocks = {
  createTask: jest.fn(),
  archive: jest.fn(),
  trash: jest.fn(),
  markRead: jest.fn(),
  tasks: [] as unknown[],
};

jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({ useTimeZone: () => "UTC" }));
jest.mock("@/lib/needt3/hooks/mail", () => ({
  useMail: () => ({ data: [m1], status: "success" }),
  useMarkRead: () => ({ mutateAsync: mocks.markRead }),
  useArchiveMail: () => ({ mutateAsync: mocks.archive }),
  useTrashMail: () => ({ mutateAsync: mocks.trash }),
}));
jest.mock("@/lib/needt3/hooks/mail-accounts", () => ({
  useMailAccounts: () => ({ data: [], isSuccess: true }),
}));
jest.mock("@/lib/needt3/hooks/mail-sync", () => ({
  useMailSync: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@/lib/needt3/hooks/events", () => ({
  useCreateEvent: () => jest.fn(),
}));
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  useTasks: () => ({ data: mocks.tasks }),
  useCreateTask: () => ({ mutateAsync: mocks.createTask }),
  useTrashTask: () => ({ trash: jest.fn() }),
}));

let host: HTMLDivElement;
let root: Root;
let box: Mailbox;

function Probe() {
  box = useMailbox();
  return null;
}

beforeEach(() => {
  mocks.tasks = [];
  mocks.createTask.mockReset();
  mocks.archive.mockReset();
  mocks.trash.mockReset();
  mocks.markRead.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(Probe)));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("makeTask", () => {
  it("creates the task with the mail as its origin, once per message", async () => {
    let release: (v: unknown) => void = () => undefined;
    mocks.createTask.mockImplementation(
      () => new Promise((r) => (release = r))
    );
    await act(async () => {
      void box.makeTask(m1, "later");
      void box.makeTask(m1, "later");
    });
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    expect(mocks.createTask.mock.calls[0][0].draft).toMatchObject({
      title: "Invoice 42",
      dueDate: null,
      noSlot: true,
      source: { kind: "mail", id: "m1", quote: null },
    });
    // while it is on its way the row already counts as made
    expect(box.made.has("m1")).toBe(true);
    expect(box.list).toHaveLength(0);
    await act(async () => release({ undo: async () => undefined }));
  });

  it("a failed write lets the row come back", async () => {
    mocks.createTask.mockRejectedValue(new Error("down"));
    await act(async () => {
      await box.makeTask(m1, "today");
    });
    expect(box.made.has("m1")).toBe(false);
    expect(box.list).toHaveLength(1);
  });
});

describe("archive and open", () => {
  it("archive closes the open message and writes once", async () => {
    mocks.markRead.mockResolvedValue({ undo: async () => undefined });
    mocks.archive.mockResolvedValue({ undo: async () => undefined });
    await act(async () => box.open(m1));
    expect(box.openId).toBe("m1");
    expect(mocks.markRead).toHaveBeenCalledWith({ id: "m1", isRead: true });
    await act(async () => {
      void box.archive(m1);
      void box.archive(m1);
    });
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    // archiving reads it too, in the same request
    expect(mocks.archive).toHaveBeenCalledWith({ id: "m1", read: true });
    expect(box.openId).toBeNull();
  });
});

describe("marking read", () => {
  it("the automatic read on open does not block a later Mark as unread", async () => {
    // the auto mark-read never answers; the person marks it unread meanwhile
    mocks.markRead.mockImplementation(() => new Promise(() => undefined));
    await act(async () => box.open(m1));
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    expect(mocks.markRead).toHaveBeenLastCalledWith({
      id: "m1",
      isRead: true,
    });
    await act(async () => {
      void box.setRead({ ...m1, isRead: true }, false);
    });
    expect(mocks.markRead).toHaveBeenCalledTimes(2);
    expect(mocks.markRead).toHaveBeenLastCalledWith({
      id: "m1",
      isRead: false,
    });
  });

  it("Mark as unread says so with the strings-file words", async () => {
    mocks.markRead.mockResolvedValue({ undo: async () => undefined });
    await act(async () => {
      await box.toggleRead({ ...m1, isRead: true });
    });
    expect(notify.success).toHaveBeenCalledWith(
      notices.markedUnread,
      expect.anything()
    );
    expect(notices.markedUnread).toBe("Marked as unread");
  });

  it("archiving a message that is already read does not ask to mark it read", async () => {
    mocks.archive.mockResolvedValue({ undo: async () => undefined });
    await act(async () => {
      await box.archive({ ...m1, isRead: true });
    });
    expect(mocks.archive).toHaveBeenCalledWith({ id: "m1", read: false });
  });
});

describe("the desktop's writes", () => {
  it("trash goes through once and closes the open message", async () => {
    mocks.trash.mockResolvedValue({ undo: async () => undefined });
    mocks.markRead.mockResolvedValue({ undo: async () => undefined });
    await act(async () => box.open(m1));
    await act(async () => {
      void box.trash(m1);
      void box.trash(m1);
    });
    expect(mocks.trash).toHaveBeenCalledTimes(1);
    expect(mocks.trash).toHaveBeenCalledWith({ id: "m1", trashed: true });
    expect(box.openId).toBeNull();
  });

  it("opening sets reading for the narrow desktop layout", async () => {
    mocks.markRead.mockResolvedValue({ undo: async () => undefined });
    await act(async () => box.open(m1));
    expect(box.reading).toBe(true);
    act(() => box.setReading(false));
    expect(box.reading).toBe(false);
    expect(box.openId).toBe("m1");
  });
});
