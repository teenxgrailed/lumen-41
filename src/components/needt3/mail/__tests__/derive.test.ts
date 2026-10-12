import type { V3MailThread } from "@/lib/needt3/map";

import fixtures from "../../../../../docs/port/prototype/port/fixtures/mail-threads.json";
import {
  firstName,
  groupByDay,
  inTab,
  initials,
  madeTasks,
  providerLabel,
  providerLink,
  tabCounts,
} from "../derive";

const TODAY = "2026-09-01";

const rows = fixtures
  .filter((f) => !f.folder)
  .map(
    (f) =>
      ({
        id: String(f.id),
        accountId: f.accountId,
        threadId: null,
        subject: f.subject,
        from: f.from,
        fromEmail: f.fromEmail,
        receivedAt: f.receivedAt,
        preview: f.preview,
        isRead: f.isRead,
        isArchived: f.isArchived,
        trashedAt: f.trashedAt,
        needsReply: f.needsReply,
        suggestedTask: f.suggestedTask,
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
      }) satisfies V3MailThread
  );

describe("madeTasks", () => {
  it("links a thread to the live task that came from it", () => {
    const made = madeTasks([
      {
        id: "t1",
        source: { kind: "mail", id: "1", quote: null },
        trashedAt: null,
      },
      {
        id: "t2",
        source: { kind: "doc", id: "1", quote: null },
        trashedAt: null,
      },
      {
        id: "t3",
        source: { kind: "mail", id: "2", quote: null },
        trashedAt: "2026-09-01T10:00:00Z",
      },
      { id: "t4", source: null, trashedAt: null },
    ]);
    expect([...made]).toEqual([["1", "t1"]]);
  });
  it("keeps the first task when a thread made two", () => {
    const made = madeTasks([
      {
        id: "a",
        source: { kind: "mail", id: "9", quote: null },
        trashedAt: null,
      },
      {
        id: "b",
        source: { kind: "mail", id: "9", quote: null },
        trashedAt: null,
      },
    ]);
    expect(made.get("9")).toBe("a");
  });
});

describe("tabs", () => {
  it("Needs you hides a thread that already became a task", () => {
    const m = { id: "1", needsReply: true };
    expect(inTab(m, "needs", new Map())).toBe(true);
    expect(inTab(m, "needs", new Map([["1", "t"]]))).toBe(false);
    expect(inTab(m, "done", new Map([["1", "t"]]))).toBe(true);
    expect(inTab({ id: "2", needsReply: false }, "all", new Map())).toBe(true);
  });
  it("counts each tab from the live list", () => {
    const made = new Map([[rows[0].id, "t"]]);
    const counts = tabCounts(rows, made);
    expect(counts.all).toBe(rows.length);
    expect(counts.done).toBe(1);
    expect(counts.needs).toBe(
      rows.filter((r) => r.needsReply && r.id !== rows[0].id).length
    );
  });
});

describe("groupByDay", () => {
  it("groups rows under Today / Yesterday / a date, in list order", () => {
    const groups = groupByDay(
      [
        { id: "a", receivedAt: "2026-09-01T09:00" },
        { id: "b", receivedAt: "2026-09-01T08:00" },
        { id: "c", receivedAt: "2026-08-31T18:00" },
        { id: "d", receivedAt: "2026-08-10T18:00" },
      ],
      TODAY
    );
    expect(groups.map((g) => [g.day, g.rows.map((r) => r.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      [expect.stringMatching(/10/), ["d"]],
    ]);
  });
  it("puts every fixture row in exactly one group", () => {
    const groups = groupByDay(rows, TODAY);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(rows.length);
    expect(new Set(groups.map((g) => g.day)).size).toBe(groups.length);
  });
});

describe("names", () => {
  it("initials and first name", () => {
    expect(initials("Jonas Weber")).toBe("JW");
    expect(initials("Print Atelier Zürich")).toBe("PA");
    expect(initials("")).toBe("?");
    expect(firstName("Jonas Weber")).toBe("Jonas");
    expect(firstName(null)).toBe("");
  });
});

describe("providerLink (Reply / Forward open the provider)", () => {
  it("opens Gmail on the account that holds the message", () => {
    expect(
      providerLink({
        provider: "GMAIL",
        externalId: "18c2f",
        address: "me@gmail.com",
      })
    ).toBe("https://mail.google.com/mail/u/me%40gmail.com/#all/18c2f");
  });
  it("opens Outlook on the web by message id", () => {
    expect(
      providerLink({
        provider: "OUTLOOK",
        externalId: "AAMk/a+b=",
        address: null,
      })
    ).toBe("https://outlook.office.com/mail/deeplink/read/AAMk%2Fa%2Bb%3D");
  });
  it("falls back to a mailto reply for IMAP", () => {
    expect(
      providerLink({
        provider: "IMAP",
        externalId: "42",
        address: "me@host.ch",
        subject: "Re: Invoice",
        fromAddress: "billing@host.ch",
      })
    ).toBe("mailto:billing%40host.ch?subject=Re%3A%20Invoice");
    expect(
      providerLink({ provider: "IMAP", externalId: "42", address: null })
    ).toBeNull();
  });
  it("has no link without a message id", () => {
    expect(providerLink(null)).toBeNull();
    expect(
      providerLink({ provider: "GMAIL", externalId: "", address: null })
    ).toBeNull();
  });
  it("names the provider", () => {
    expect(providerLabel("GMAIL")).toBe("Gmail");
    expect(providerLabel("OUTLOOK")).toBe("Outlook");
    expect(providerLabel("IMAP")).toBe("your mail app");
  });
});
