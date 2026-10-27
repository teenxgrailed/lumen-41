import type { FeedItem } from "@/lib/needt3/hooks/notifications";

import { groupFeed, rowKeys } from "../notes-group";

const base = Date.parse("2026-10-27T12:00:00.000Z");
const item = (
  key: string,
  kind: FeedItem["kind"],
  minutesAgo: number,
  over: Partial<FeedItem> = {}
): FeedItem => ({
  key,
  group: "activity",
  kind,
  actor: null,
  title: key,
  body: null,
  at: new Date(base - minutesAgo * 60_000).toISOString(),
  link: "/today",
  unread: false,
  ...over,
});

const shape = (rows: ReturnType<typeof groupFeed>) =>
  rows.map((r) =>
    r.type === "one" ? r.item.key : `${r.title} [${rowKeys(r).join(",")}]`
  );

describe("groupFeed", () => {
  it("folds every overdue task into one row where the newest would be", () => {
    const rows = groupFeed([
      item("c1", "comment", 5, { actor: "Lena" }),
      item("o1", "overdue", 60),
      item("s1", "share", 90, { actor: "Tom" }),
      item("o2", "overdue", 600),
      item("o3", "overdue", 2000),
    ]);
    expect(shape(rows)).toEqual(["c1", "3 tasks overdue [o1,o2,o3]", "s1"]);
  });

  it("leaves a single overdue task as a row of its own", () => {
    expect(shape(groupFeed([item("o1", "overdue", 60)]))).toEqual(["o1"]);
  });

  it("folds three or more of a kind back to back within two hours", () => {
    const rows = groupFeed([
      item("a1", "agent", 1),
      item("a2", "agent", 10),
      item("a3", "agent", 20),
      item("r1", "reminder", 30),
      item("r2", "reminder", 40),
    ]);
    expect(shape(rows)).toEqual([
      "Needt made 3 changes [a1,a2,a3]",
      "r1",
      "r2",
    ]);
  });

  it("does not fold across a gap longer than the burst, or people", () => {
    const rows = groupFeed([
      item("a1", "agent", 1),
      item("a2", "agent", 10),
      item("a3", "agent", 400),
      item("c1", "comment", 401, { actor: "Lena" }),
      item("c2", "comment", 402, { actor: "Lena" }),
      item("c3", "comment", 403, { actor: "Lena" }),
    ]);
    expect(shape(rows)).toEqual(["a1", "a2", "a3", "c1", "c2", "c3"]);
  });

  it("marks a group unread when any member is", () => {
    const [row] = groupFeed([
      item("o1", "overdue", 60),
      item("o2", "overdue", 70, { unread: true }),
    ]);
    expect(row.type === "group" && row.unread).toBe(true);
  });
});
