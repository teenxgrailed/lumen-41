import {
  dayTime,
  emptyFor,
  foldsAsRead,
  mailTaskDraft,
  reconnectHref,
  searchMail,
  swipeRules,
  unreadLine,
  whenLabel,
  withPending,
} from "../model";

const TODAY = "2026-10-11";

const msg = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  from: "Anna Weber",
  subject: "Invoice 42",
  preview: "Could you send the signed copy",
  receivedAt: "2026-10-11T09:12",
  isRead: false,
  needsReply: true,
  suggestedTask: null as string | null,
  ...over,
});

describe("whenLabel / dayTime", () => {
  it("today shows the time, older mail the day", () => {
    expect(whenLabel("2026-10-11T09:12", TODAY)).toBe("09:12");
    expect(whenLabel("2026-10-10T18:40", TODAY)).toBe("Yesterday");
  });
  it("the reader line has both", () => {
    expect(dayTime("2026-10-11T09:12", TODAY)).toBe("Today 09:12");
  });
  it("a message without a date gives an empty label", () => {
    expect(whenLabel("", TODAY)).toBe("");
    expect(dayTime(null, TODAY)).toBe("");
  });
});

describe("searchMail", () => {
  const list = [
    msg(),
    msg({ id: "m2", from: "Bob", subject: "Lunch", preview: "noodles?" }),
    msg({ id: "m3", from: "Cara", subject: "Re: invoice", preview: "" }),
  ];
  it("matches sender, subject and preview, case-insensitively", () => {
    expect(searchMail(list, "INVOICE", TODAY).map((h) => h.id)).toEqual([
      "m1",
      "m3",
    ]);
    expect(searchMail(list, "noodles", TODAY).map((h) => h.id)).toEqual(["m2"]);
    expect(searchMail(list, "weber", TODAY).map((h) => h.id)).toEqual(["m1"]);
  });
  it("an empty query finds nothing and the list is capped", () => {
    expect(searchMail(list, "  ", TODAY)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => msg({ id: `x${i}` }));
    expect(searchMail(many, "invoice", TODAY)).toHaveLength(5);
  });
  it("a hit carries the sender and the day in its meta", () => {
    expect(searchMail(list, "lunch", TODAY)[0]).toEqual({
      id: "m2",
      title: "Lunch",
      meta: "Bob · 09:12",
    });
  });
});

describe("tasks made from mail", () => {
  it("the draft is the desktop's: origin mail, 15 min, today or no slot", () => {
    expect(mailTaskDraft(msg(), "today", TODAY)).toEqual({
      title: "Invoice 42",
      dueDate: TODAY,
      noSlot: false,
      estimatedMinutes: 15,
      source: { kind: "mail", id: "m1", quote: null },
    });
    expect(
      mailTaskDraft(msg({ suggestedTask: "Sign the invoice" }), "later", TODAY)
    ).toMatchObject({
      title: "Sign the invoice",
      dueDate: null,
      noSlot: true,
    });
  });
  it("a message without a subject still gets a title", () => {
    expect(mailTaskDraft(msg({ subject: "" }), "today", TODAY).title).toBe(
      "No subject"
    );
  });
  it("a pending task counts as made, the server's id is kept", () => {
    const made = new Map([["m1", "t1"]]);
    const merged = withPending(made, new Set(["m1", "m2"]));
    expect(merged.get("m1")).toBe("t1");
    expect(merged.has("m2")).toBe(true);
    expect(withPending(made, new Set())).toBe(made);
  });
  it("swipe left is off once a task exists, archive stays", () => {
    const made = new Map([["m1", "t1"]]);
    expect(swipeRules({ id: "m1" }, made)).toEqual({
      canArchive: true,
      canMakeTask: false,
    });
    expect(swipeRules({ id: "m2" }, made).canMakeTask).toBe(true);
  });
});

describe("states", () => {
  it("the Reconnect links are the desktop banner's", () => {
    expect(reconnectHref("GMAIL")).toBe("/api/mail/oauth/google/auth");
    expect(reconnectHref("OUTLOOK")).toBe("/api/mail/oauth/outlook/auth");
    expect(reconnectHref("IMAP")).toBe("/settings#integrations");
  });
  it("no account → the Connections empty state; a tab empty → its line", () => {
    const base = {
      tab: "needs" as const,
      listLength: 0,
      liveLength: 0,
      accountsKnown: true,
      accountCount: 0,
    };
    expect(emptyFor(base)?.kind).toBe("no-account");
    expect(emptyFor({ ...base, accountCount: 1 })).toMatchObject({
      kind: "tab",
      to: "all",
    });
    // accounts still loading: never claim "not connected"
    expect(emptyFor({ ...base, accountsKnown: false })?.kind).toBe("tab");
    // mail present but this tab empty
    expect(emptyFor({ ...base, liveLength: 3 })?.kind).toBe("tab");
    expect(emptyFor({ ...base, listLength: 2 })).toBeNull();
  });
  it("All with everything read folds under Read", () => {
    expect(foldsAsRead("all", [{ isRead: true }])).toBe(true);
    expect(foldsAsRead("all", [{ isRead: true }, { isRead: false }])).toBe(
      false
    );
    expect(foldsAsRead("needs", [{ isRead: true }])).toBe(false);
    expect(foldsAsRead("all", [])).toBe(false);
  });
  it("the unread line", () => {
    expect(unreadLine(2)).toBe("2 unread");
    expect(unreadLine(0)).toBe("All read ✓");
  });
});
