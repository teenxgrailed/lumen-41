import type { WhatsNewFeed } from "../compile";
import { parseSeen, seenMarker, unseenIds } from "../seen";

const feed: WhatsNewFeed = {
  version: 1,
  groups: [
    {
      date: "2026-10-21",
      entries: [
        { id: "mail-1", text: "Mail" },
        { id: "pages-1", text: "Pages" },
      ],
    },
    { date: "2026-10-20", entries: [{ id: "board-1", text: "Board" }] },
    { date: null, entries: [{ id: "undated-1", text: "Undated" }] },
  ],
};

describe("unseenIds", () => {
  it("before the first opening, counts what is newer than the account", () => {
    expect(unseenIds(feed, null, "2026-10-20")).toEqual(["mail-1", "pages-1"]);
    expect(unseenIds(feed, null, "2026-10-21")).toEqual([]);
  });

  it("counts every dated entry when the account has no first day", () => {
    expect(unseenIds(feed, null, null)).toEqual([
      "mail-1",
      "pages-1",
      "board-1",
    ]);
  });

  it("after an opening, counts newer days and same-day additions", () => {
    expect(
      unseenIds(feed, { date: "2026-10-21", ids: ["mail-1"] }, null)
    ).toEqual(["pages-1"]);
    expect(
      unseenIds(feed, { date: "2026-10-20", ids: ["board-1"] }, "2026-10-01")
    ).toEqual(["mail-1", "pages-1"]);
  });

  it("counts nothing once the newest day has been opened", () => {
    expect(
      unseenIds(feed, { date: "2026-10-21", ids: ["mail-1", "pages-1"] }, null)
    ).toEqual([]);
    expect(unseenIds(feed, { date: "2026-12-01", ids: [] }, null)).toEqual([]);
  });

  it("never counts undated entries", () => {
    expect(unseenIds(feed, null, null)).not.toContain("undated-1");
  });
});

describe("seenMarker", () => {
  it("is the newest dated day and its entries", () => {
    expect(seenMarker(feed)).toEqual({
      date: "2026-10-21",
      ids: ["mail-1", "pages-1"],
    });
  });

  it("clears what it was computed from", () => {
    expect(unseenIds(feed, seenMarker(feed), null)).toEqual([]);
  });

  it("is null when nothing is dated", () => {
    expect(
      seenMarker({ version: 1, groups: [{ date: null, entries: [] }] })
    ).toBeNull();
    expect(seenMarker({ version: 1, groups: [] })).toBeNull();
  });
});

describe("parseSeen", () => {
  it("reads a stored marker and drops what is not an id", () => {
    expect(parseSeen({ date: "2026-10-21", ids: ["a", 2, "b"] })).toEqual({
      date: "2026-10-21",
      ids: ["a", "b"],
    });
    expect(parseSeen({ date: "2026-10-21" })).toEqual({
      date: "2026-10-21",
      ids: [],
    });
  });

  it("reads anything else as nothing opened", () => {
    expect(parseSeen(undefined)).toBeNull();
    expect(parseSeen("2026-10-21")).toBeNull();
    expect(parseSeen({ date: "yesterday", ids: [] })).toBeNull();
  });
});
