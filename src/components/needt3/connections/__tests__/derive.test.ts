import type { CatalogEntry, IntegrationRow } from "@/lib/needt3/hooks/catalog";
import type { V3Connection } from "@/lib/needt3/hooks/connections";

import {
  CHIP_LABEL,
  type CnItem,
  aiToolsLocked,
  buildItems,
  categoriesOf,
  chipOf,
  chipsOf,
  connectPlan,
  counts,
  disconnectKind,
  disconnectTitle,
  filterItems,
  heroStatus,
  pillOf,
  unavailableReason,
  visibleItems,
} from "../derive";

const entry = (
  slug: string,
  name: string,
  category: CatalogEntry["category"],
  extra: Partial<CatalogEntry> = {}
): CatalogEntry => ({
  slug,
  name,
  description: `${name} things`,
  category,
  native: false,
  configured: true,
  ...extra,
});

const catalog: CatalogEntry[] = [
  entry("google-calendar", "Google Calendar", "calendar", { native: true }),
  entry("icloud-calendar", "Apple / iCloud", "calendar", { native: true }),
  entry("needt-api", "Needt API", "developer", { native: true }),
  entry("notion", "Notion", "notes"),
  entry("linear", "Linear", "tasks"),
];
const acct = (over: Partial<V3Connection>): V3Connection => ({
  provider: "google",
  kind: "calendar",
  state: "connected",
  label: "me@example.com",
  detail: null,
  accountId: "a1",
  ...over,
});
const rows: IntegrationRow[] = [
  { id: "i1", toolkit: "NOTION", status: "CONNECTED" },
  { id: "i2", toolkit: "linear", status: "ERROR" },
  { id: "i3", toolkit: "slack", status: "DISCONNECTED" },
];

describe("buildItems", () => {
  const items = buildItems(catalog, rows, [
    acct({}),
    acct({
      provider: "google",
      kind: "mail",
      label: "me@gmail.com",
      accountId: "m1",
      state: "error",
      detail: "Needs reconnecting",
    }),
  ]);
  const by = (slug: string) => items.find((i) => i.slug === slug) as CnItem;

  it("a native calendar is connected when an account of its provider exists", () => {
    expect(by("google-calendar")).toMatchObject({
      state: "connected",
      account: "me@example.com",
      accountId: "a1",
      kind: "calendar",
    });
    expect(by("icloud-calendar").state).toBe("none");
  });
  it("adds the mailboxes and reads their health", () => {
    expect(by("gmail")).toMatchObject({
      kind: "mail",
      state: "disconnected",
      accountId: "m1",
      detail: "Needs reconnecting",
    });
    expect(by("outlook-mail").state).toBe("none");
  });
  it("a toolkit matches its integration row ignoring case, and ERROR needs attention", () => {
    expect(by("notion")).toMatchObject({ state: "connected", accountId: "i1" });
    expect(by("linear")).toMatchObject({
      state: "disconnected",
      accountId: "i2",
    });
  });
  it("a DISCONNECTED row is not a connection", () => {
    expect(
      buildItems([entry("slack", "Slack", "communication")], rows, [])[0].state
    ).toBe("none");
  });
});

describe("a mailbox the server catalog also lists", () => {
  it("is one card with one key, the native mailbox", () => {
    const items = buildItems(
      [
        entry("gmail", "Gmail", "communication"),
        entry("notion", "Notion", "notes"),
      ],
      [],
      [
        acct({
          kind: "mail",
          provider: "google",
          label: "me@gmail.com",
          accountId: "m1",
        }),
      ]
    );
    const gmail = items.filter((i) => i.slug === "gmail");
    expect(gmail).toHaveLength(1);
    expect(gmail[0]).toMatchObject({ kind: "mail", native: true });
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });
});

describe("several accounts of one provider", () => {
  const items = buildItems(
    catalog,
    [],
    [acct({}), acct({ label: "work@example.com", accountId: "a2" })]
  );
  const google = items.filter((i) => i.slug === "google-calendar");
  it("get one card each, keyed and named by the account", () => {
    expect(google.map((i) => [i.key, i.account, i.accountId])).toEqual([
      ["google-calendar:a1", "me@example.com", "a1"],
      ["google-calendar:a2", "work@example.com", "a2"],
    ]);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });
  it("the confirm names the account it disconnects", () => {
    expect(disconnectTitle(google[1])).toBe(
      "Disconnect Google Calendar (work@example.com)?"
    );
    expect(disconnectTitle({ name: "Notion", account: null })).toBe(
      "Disconnect Notion?"
    );
  });
  it("a single account keeps the plain slug key", () => {
    expect(
      buildItems(catalog, [], [acct({})]).find(
        (i) => i.slug === "google-calendar"
      )?.key
    ).toBe("google-calendar");
  });
});

describe("filterItems / counts", () => {
  const items = buildItems(catalog, rows, [acct({})]);
  it("Connected hides what is not connected", () => {
    const slugs = filterItems(items, {
      q: "",
      chip: "all",
      show: "connected",
    }).map((i) => i.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(["google-calendar", "notion", "linear"])
    );
    expect(slugs).not.toContain("needt-api");
  });
  it("a chip keeps one group; search matches name, description and chip name", () => {
    expect(
      filterItems(items, { q: "", chip: "work", show: "all" }).map(
        (i) => i.slug
      )
    ).toEqual(["needt-api", "notion", "linear"]);
    expect(
      filterItems(items, { q: "", chip: "cal", show: "all" }).map((i) => i.slug)
    ).toEqual(["google-calendar", "icloud-calendar"]);
    expect(
      filterItems(items, { q: "linear", chip: "all", show: "all" })
    ).toHaveLength(1);
    expect(
      filterItems(items, { q: "  CALENDAR ", chip: "all", show: "all" }).length
    ).toBeGreaterThan(0);
    // The chip's own name finds its cards, as in the prototype's haystack.
    expect(
      filterItems(items, { q: "mail & chat", chip: "all", show: "all" }).map(
        (i) => i.slug
      )
    ).toEqual(["gmail", "outlook-mail"]);
    expect(filterItems(items, { q: "zzz", chip: "all", show: "all" })).toEqual(
      []
    );
  });
  it("categories once, in order; counts", () => {
    expect(categoriesOf(items)).toEqual([
      "calendar",
      "developer",
      "notes",
      "tasks",
      "communication",
    ]);
    expect(counts(items)).toEqual({ connected: 2, issues: 1 });
  });
});

describe("chips: our categories onto the prototype's", () => {
  const e = (slug: string, category: CatalogEntry["category"]) =>
    chipOf({ slug, category });
  it("maps every real category onto one chip", () => {
    expect(e("slack", "communication")).toBe("mail");
    expect(e("google-calendar", "calendar")).toBe("cal");
    expect(e("todoist", "tasks")).toBe("work");
    expect(e("notion", "notes")).toBe("work");
    expect(e("linear", "developer")).toBe("work");
    expect(e("needt-api", "developer")).toBe("work");
    expect(e("openai", "ai")).toBe("work");
    expect(e("googledrive", "files")).toBe("files");
  });
  it("files GitHub under Files and the design tools under Creative", () => {
    expect(e("github", "developer")).toBe("files");
    expect(e("gitlab", "developer")).toBe("files");
    expect(e("figma", "files")).toBe("creative");
    expect(e("pinterest", "notes")).toBe("creative");
  });
  it("draws only the chips that have a card, in the prototype's order", () => {
    const items = buildItems(catalog, rows, [acct({})]);
    expect(chipsOf(items)).toEqual(["mail", "cal", "work"]);
    expect(chipsOf(items).map((id) => CHIP_LABEL[id])).toEqual([
      "Mail & chat",
      "Calendars",
      "Work",
    ]);
    expect(chipsOf([])).toEqual([]);
  });
});

describe("heroStatus", () => {
  const s = (state: CnItem["state"], name = "Gmail") => ({ name, state });
  it("a card that lost access wins: names it, red", () => {
    expect(
      heroStatus([s("connected"), s("disconnected", "Outlook")], "apps")
    ).toEqual({
      text: "Outlook needs reconnecting",
      tone: "bad",
      names: ["Outlook"],
    });
    expect(
      heroStatus(
        [s("disconnected", "Outlook"), s("disconnected", "Slack")],
        "apps"
      ).text
    ).toBe("Outlook, Slack need reconnecting");
  });
  it("two accounts of one app name it once", () => {
    expect(
      heroStatus(
        [s("disconnected", "Outlook"), s("disconnected", "Outlook")],
        "apps"
      ).names
    ).toEqual(["Outlook"]);
  });
  it("counts what is live, and says nothing is when nothing is", () => {
    expect(
      heroStatus([s("connected"), s("connected", "Notion")], "apps")
    ).toMatchObject({ text: "2 connected", tone: "ok" });
    expect(heroStatus([s("connected")], "ai").text).toBe("1 connected");
    expect(heroStatus([s("none")], "apps")).toMatchObject({
      text: "Nothing connected yet",
      tone: "none",
    });
    expect(heroStatus([], "ai").text).toBe("No AI tools connected yet");
  });
});

describe("connectPlan", () => {
  it("Google connect starts the real calendar OAuth", () => {
    expect(
      connectPlan({ slug: "google-calendar", configured: true, native: true })
    ).toEqual({ kind: "navigate", href: "/api/calendar/google/auth" });
    expect(
      connectPlan({ slug: "gmail", configured: true, native: true })
    ).toEqual({ kind: "navigate", href: "/api/mail/oauth/google/auth" });
  });
  it("Apple takes a CalDAV login, a toolkit goes through Composio", () => {
    expect(
      connectPlan({ slug: "icloud-calendar", configured: true, native: true })
    ).toEqual({ kind: "caldav" });
    expect(
      connectPlan({ slug: "notion", configured: true, native: false })
    ).toEqual({ kind: "toolkit", toolkit: "notion" });
  });
  it("is unavailable when the server cannot, and for the API card", () => {
    expect(
      connectPlan({ slug: "notion", configured: false, native: false }).kind
    ).toBe("unavailable");
    expect(
      connectPlan({ slug: "needt-api", configured: true, native: true }).kind
    ).toBe("unavailable");
  });
  it("tells an admin what to add, and everyone else that it is not there yet", () => {
    const item = {
      slug: "notion",
      name: "Notion",
      configured: false,
      native: false,
      requires: "COMPOSIO_API_KEY in the server environment",
    };
    expect(connectPlan(item, true)).toEqual({
      kind: "unavailable",
      reason:
        "Notion needs COMPOSIO_API_KEY in the server environment. Add it, then try again.",
    });
    expect(connectPlan(item, false)).toEqual({
      kind: "unavailable",
      reason: "Notion is not available yet.",
    });
    expect(unavailableReason("Notion", undefined, true)).toBe(
      "Notion is not available yet."
    );
  });
  it("disconnect route by kind, pill, AI gate", () => {
    expect(disconnectKind({ kind: "calendar" })).toBe("calendar");
    expect(disconnectKind({ kind: "mail" })).toBe("mailbox");
    expect(disconnectKind({ kind: "app" })).toBe("toolkit");
    expect(pillOf("connected", false).label).toBe("Connected");
    expect(pillOf("none", true).label).toBe("Connecting…");
    expect(pillOf("disconnected", false).tone).toBe("danger");
    expect(aiToolsLocked("free")).toBe(true);
    expect(aiToolsLocked(undefined)).toBe(false);
    expect(aiToolsLocked(null)).toBe(false);
    expect(aiToolsLocked("trial")).toBe(false);
  });
});

describe("what the server cannot start", () => {
  const cat: CatalogEntry[] = [
    entry("google-calendar", "Google Calendar", "calendar", {
      native: true,
      configured: false,
      requires: "a Google client ID and secret",
    }),
    entry("outlook-calendar", "Outlook Calendar", "calendar", {
      native: true,
    }),
    entry("icloud-calendar", "Apple / iCloud", "calendar", { native: true }),
    entry("notion", "Notion", "notes", { configured: false }),
  ];

  it("a mailbox is set up exactly when the calendar of its provider is", () => {
    const items = buildItems(cat, [], []);
    const by = (slug: string) => items.find((i) => i.slug === slug)!;
    expect(by("gmail")).toMatchObject({
      configured: false,
      requires: "a Google client ID and secret",
    });
    expect(by("outlook-mail").configured).toBe(true);
  });

  it("hides what cannot start from everyone but an admin", () => {
    const items = buildItems(cat, [], []);
    const slugs = (admin: boolean) =>
      visibleItems(items, admin).map((i) => i.slug);
    expect(slugs(false)).toEqual([
      "outlook-calendar",
      "icloud-calendar",
      "outlook-mail",
    ]);
    expect(slugs(true)).toContain("notion");
    expect(slugs(true)).toContain("gmail");
  });

  it("keeps a connected card whose server setup was removed", () => {
    const items = buildItems(cat, [], [acct({})]);
    expect(visibleItems(items, false).map((i) => i.slug)).toContain(
      "google-calendar"
    );
  });
});
