import type { CnItem } from "../../../connections/derive";
import {
  chipPressed,
  connectionChips,
  connectionHits,
  connectionMeta,
  connectionsSub,
  disconnectText,
  groupConnections,
  pickChip,
  roleView,
  statusWord,
  templateHits,
  trashHits,
  trashSectionsOf,
  trashSub,
} from "../logic";

const item = (over: Partial<CnItem> & { slug: string }): CnItem => ({
  key: over.slug,
  name: over.slug,
  description: `${over.slug} description`,
  category: "calendar",
  native: false,
  configured: true,
  kind: "app",
  state: "none",
  account: null,
  detail: null,
  accountId: null,
  ...over,
});

const gcal = item({
  slug: "google-calendar",
  name: "Google Calendar",
  state: "connected",
  account: "me@x.com",
});
const outlook = item({
  slug: "outlook-mail",
  name: "Outlook Mail",
  category: "communication",
  state: "disconnected",
  account: "me@o.com",
  detail: "Needs reconnecting",
});
const notion = item({ slug: "notion", name: "Notion", category: "notes" });
const gmail = item({
  slug: "gmail",
  name: "Gmail",
  category: "communication",
});

describe("connectionsSub", () => {
  it("names the accounts that need you, otherwise counts what is live", () => {
    expect(connectionsSub([gcal, outlook], "apps", true)).toBe(
      "Outlook Mail needs reconnecting"
    );
    expect(
      connectionsSub(
        [gcal, outlook, { ...gmail, state: "disconnected" }],
        "apps",
        true
      )
    ).toBe("Outlook Mail, Gmail need reconnecting");
    expect(connectionsSub([gcal, notion], "apps", true)).toBe("1 connected");
    expect(connectionsSub([notion], "apps", true)).toBe(
      "Nothing connected yet"
    );
  });
  it("says nothing before the first load, and the AI tab has its own line", () => {
    expect(connectionsSub([], "apps", false)).toBe("");
    expect(connectionsSub([gcal], "ai", true)).toBe(
      "No AI tools connected yet"
    );
  });
});

describe("groupConnections", () => {
  it("puts lost access first, then one section per chip in the prototype's order", () => {
    const { down, groups } = groupConnections([gcal, outlook, gmail, notion]);
    expect(down.map((i) => i.slug)).toEqual(["outlook-mail"]);
    expect(
      groups.map((g) => [g.id, g.label, g.items.map((i) => i.slug)])
    ).toEqual([
      ["mail", "Mail & chat", ["gmail"]],
      ["cal", "Calendars", ["google-calendar"]],
      ["work", "Work", ["notion"]],
    ]);
  });
  it("draws no empty section", () => {
    expect(groupConnections([]).groups).toEqual([]);
    expect(groupConnections([outlook]).groups).toEqual([]);
  });
});

describe("connectionMeta", () => {
  it("a press in flight reads Connecting whatever the state", () => {
    expect(connectionMeta(outlook, true)).toEqual({
      text: "Connecting…",
      tone: null,
    });
  });
  it("lost access is late and says why; connected shows the account", () => {
    expect(connectionMeta(outlook, false)).toEqual({
      text: "Needs reconnecting",
      tone: "late",
    });
    expect(connectionMeta({ ...outlook, detail: null }, false).text).toMatch(
      /Lost access/
    );
    expect(connectionMeta(gcal, false)).toEqual({
      text: "me@x.com",
      tone: "on",
    });
    expect(connectionMeta({ ...gcal, account: null }, false).text).toBe(
      "Google Calendar"
    );
  });
  it("a card nobody connected shows its category", () => {
    expect(connectionMeta(notion, false)).toEqual({
      text: "Notes",
      tone: null,
    });
  });
});

describe("chips", () => {
  const items = [gcal, outlook, notion];
  it("All, Connected, then the prototype's chips that have a card", () => {
    expect(connectionChips(items).map((c) => c.id)).toEqual([
      "all",
      "connected",
      "mail",
      "cal",
      "work",
    ]);
  });
  it("All is pressed only when nothing narrows the list", () => {
    expect(chipPressed("all", { chip: "all", show: "all" })).toBe(true);
    expect(chipPressed("all", { chip: "work", show: "all" })).toBe(false);
    expect(chipPressed("all", { chip: "all", show: "connected" })).toBe(false);
    expect(chipPressed("connected", { chip: "all", show: "connected" })).toBe(
      true
    );
    expect(chipPressed("work", { chip: "work", show: "all" })).toBe(true);
  });
  it("a chip toggles itself; All clears both", () => {
    expect(pickChip("work", { chip: "all", show: "all" })).toEqual({
      chip: "work",
      show: "all",
    });
    expect(pickChip("work", { chip: "work", show: "all" })).toEqual({
      chip: "all",
      show: "all",
    });
    expect(pickChip("connected", { chip: "work", show: "all" })).toEqual({
      chip: "work",
      show: "connected",
    });
    expect(pickChip("connected", { chip: "work", show: "connected" })).toEqual({
      chip: "work",
      show: "all",
    });
    expect(pickChip("all", { chip: "work", show: "connected" })).toEqual({
      chip: "all",
      show: "all",
    });
  });
});

describe("hits", () => {
  it("connections: by name or description, six at most, with the state", () => {
    const hits = connectionHits([gcal, outlook, notion], "o");
    expect(hits.map((h) => h.id)).toEqual([
      "google-calendar",
      "outlook-mail",
      "notion",
    ]);
    expect(hits[0].meta).toBe("Connected · me@x.com");
    expect(hits[1].meta).toBe("Needs reconnecting");
    expect(hits[2].meta).toBe("Notes");
    expect(connectionHits([gcal], "  ")).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) =>
      item({ slug: `app${i}`, name: `App ${i}` })
    );
    expect(connectionHits(many, "app")).toHaveLength(6);
  });
  it("templates: by name or description", () => {
    const list = [
      { id: "1", name: "Weekly review", description: "Look back" },
      { id: "2", name: "Trip", description: null },
    ];
    expect(templateHits(list, "week").map((h) => h.id)).toEqual(["1"]);
    expect(templateHits(list, "back").map((h) => h.id)).toEqual(["1"]);
    expect(templateHits(list, "trip")[0].meta).toBe("Start a page from this");
    expect(templateHits(list, "")).toEqual([]);
  });
});

describe("roles", () => {
  it("a grant's role is its own label; anything else reads as view-only", () => {
    expect(roleView("EDITOR").label).toBe("Can edit");
    expect(roleView("FULL_ACCESS").label).toBe("Full access");
    expect(roleView("VIEWER").label).toBe("Can view");
    expect(roleView(null).key).toBe("VIEWER");
    expect(roleView("OWNER").key).toBe("VIEWER");
  });
});

describe("disconnect copy", () => {
  it("names the account only when it differs from the app", () => {
    expect(disconnectText(gcal)).toMatch(/from Google Calendar for me@x.com\./);
    expect(disconnectText({ name: "Notion", account: "Notion" })).not.toMatch(
      / for /
    );
    expect(statusWord("none", true)).toBe("Connecting…");
    expect(statusWord("disconnected", false)).toBe("Needs reconnecting");
    expect(statusWord("connected", false)).toBe("Connected");
    expect(statusWord("none", false)).toBe("Not connected");
  });
});

describe("trash", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  const args = {
    now,
    timeZone: "UTC",
    projectName: (id: string | null) => (id === "p1" ? "Home" : undefined),
  };
  const tasks = [
    {
      id: "t1",
      title: "Old",
      trashedAt: "2026-10-01T09:00:00.000Z",
      projectId: null,
    },
    {
      id: "t2",
      title: "",
      trashedAt: "2026-10-10T09:00:00.000Z",
      projectId: "p1",
    },
  ];
  const boards = [
    { id: "b1", title: "Ideas", trashedAt: "2026-10-11T11:30:00.000Z" },
  ];

  it("tasks then moodboards, newest first, how many days are left", () => {
    const s = trashSectionsOf({ ...args, tasks, boards });
    expect(s.map((x) => x.id)).toEqual(["tasks", "moodboards"]);
    expect(s[0].rows.map((r) => r.id)).toEqual(["t2", "t1"]);
    expect(s[0].rows[0].title).toBe("Untitled");
    expect(s[0].rows[0].meta).toBe("Deleted 10 Oct · from Home · 29 days left");
    expect(s[0].rows[1].meta).toBe("Deleted 1 Oct · 20 days left");
    expect(s[1].rows[0].meta).toBe("Deleted Just now · 30 days left");
  });
  it("pages come first, newest first, with their project", () => {
    const pages = [
      {
        id: "g1",
        title: "Brief",
        trashedAt: "2026-10-09T09:00:00.000Z",
        projectId: null,
      },
      {
        id: "g2",
        title: "",
        trashedAt: "2026-10-11T09:00:00.000Z",
        projectId: "p1",
      },
    ];
    const s = trashSectionsOf({ ...args, pages, tasks, boards });
    expect(s.map((x) => x.id)).toEqual(["pages", "tasks", "moodboards"]);
    expect(s[0].rows.map((r) => [r.kind, r.id, r.title])).toEqual([
      ["page", "g2", "Untitled"],
      ["page", "g1", "Brief"],
    ]);
    expect(s[0].rows[0].meta).toBe(
      "Deleted today \u00b7 from Home \u00b7 30 days left"
    );
  });
  it("a kind with nothing in it has no section", () => {
    expect(
      trashSectionsOf({ ...args, tasks: [], boards }).map((x) => x.id)
    ).toEqual(["moodboards"]);
    expect(trashSectionsOf({ ...args, tasks: [], boards: [] })).toEqual([]);
  });
  it("the sub line counts, and keeps the 30-day promise while empty", () => {
    expect(trashSub(0)).toBe(
      "Pages, tasks and moodboards stay here for 30 days"
    );
    expect(trashSub(1)).toBe("1 item · kept 30 days");
    expect(trashSub(3)).toBe("3 items · kept 30 days");
  });
  it("hits find a row by title and carry kind:id", () => {
    const s = trashSectionsOf({ ...args, tasks, boards });
    expect(trashHits(s, "ideas").map((h) => h.id)).toEqual(["board:b1"]);
    expect(trashHits(s, "OLD")[0].id).toBe("task:t1");
    expect(trashHits(s, "")).toEqual([]);
  });
});
