import { newDate } from "@/lib/date-utils";
import type { V3Board } from "@/lib/needt3/map";

import {
  BOARD_SORTS,
  DEFAULT_BOARD_SORT,
  FREE_BOARDS,
  TRASH_DAYS,
  boardCount,
  boardGate,
  isSharedWithMe,
  parseBoardSort,
  pickBoardSort,
  roleLabel,
  sharedMeta,
  sortBoards,
  templatePageTitle,
  templatesMeta,
  trashAgo,
  trashDaysLeft,
  trashMeta,
  trashSections,
} from "../derive";

const board = (id: string, title: string, createdAt: string, sync?: string) =>
  ({
    id,
    title,
    createdAt,
    projectId: null,
    linkShare: false,
    pinterestBoardId: null,
    pinterestStatus: null,
    pinterestSyncedAt: sync ?? null,
    trashedAt: null,
  }) as V3Board;

const list = [
  board("a", "Zine", "2026-10-01T10:00:00Z"),
  board("b", "autumn drop", "2026-10-05T10:00:00Z"),
  board("c", "Shoot", "2026-09-20T10:00:00Z", "2026-10-08T10:00:00Z"),
];

describe("sortBoards", () => {
  it("updated: newest of creation and Pinterest sync first", () => {
    const ids = sortBoards(list, DEFAULT_BOARD_SORT).map((b) => b.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });
  it("created: newest first, flips to oldest first", () => {
    expect(
      sortBoards(list, { key: "created", dir: "desc" }).map((b) => b.id)
    ).toEqual(["b", "a", "c"]);
    expect(
      sortBoards(list, { key: "created", dir: "asc" }).map((b) => b.id)
    ).toEqual(["c", "a", "b"]);
  });
  it("name: A to Z ignoring case, flips to Z to A", () => {
    expect(
      sortBoards(list, { key: "name", dir: "asc" }).map((b) => b.title)
    ).toEqual(["autumn drop", "Shoot", "Zine"]);
    expect(
      sortBoards(list, { key: "name", dir: "desc" }).map((b) => b.title)
    ).toEqual(["Zine", "Shoot", "autumn drop"]);
  });
  it("does not mutate its input", () => {
    const copy = [...list];
    sortBoards(list, { key: "name", dir: "asc" });
    expect(list).toEqual(copy);
  });
});

describe("pickBoardSort / parseBoardSort", () => {
  it("another key starts at its natural direction", () => {
    expect(pickBoardSort(DEFAULT_BOARD_SORT, "name")).toEqual({
      key: "name",
      dir: "asc",
    });
  });
  it("the active key flips", () => {
    expect(pickBoardSort({ key: "name", dir: "asc" }, "name")).toEqual({
      key: "name",
      dir: "desc",
    });
  });
  it("reads a saved sort and ignores junk", () => {
    expect(parseBoardSort('{"key":"created","dir":"asc"}')).toEqual({
      key: "created",
      dir: "asc",
    });
    expect(parseBoardSort('{"key":"nope","dir":"asc"}')).toEqual(
      DEFAULT_BOARD_SORT
    );
    expect(parseBoardSort("{")).toEqual(DEFAULT_BOARD_SORT);
    expect(parseBoardSort(null)).toEqual(DEFAULT_BOARD_SORT);
    expect(BOARD_SORTS.map((s) => s.key)).toEqual([
      "name",
      "created",
      "updated",
    ]);
  });
});

describe("boardGate", () => {
  it("Free stops at one board, every other plan is open", () => {
    expect(boardGate("free", FREE_BOARDS)).toEqual({
      atLimit: true,
      used: 1,
      max: 1,
    });
    expect(boardGate("free", 0).atLimit).toBe(false);
    expect(boardGate("trial", 9)).toEqual({
      atLimit: false,
      used: 9,
      max: null,
    });
    expect(boardGate(undefined, 9).atLimit).toBe(false);
  });
  it("counts", () => {
    expect(boardCount(1)).toBe("1 board");
    expect(boardCount(3)).toBe("3 boards");
  });
});

describe("templates", () => {
  it("titles a page '<template> — <day>' in the person's zone", () => {
    const now = newDate("2026-10-09T23:30:00Z");
    expect(templatePageTitle("Weekly review", now, "Europe/Zurich")).toBe(
      "Weekly review — 10 Oct"
    );
    expect(templatePageTitle("  ", now, "UTC")).toBe("Untitled — 9 Oct");
  });
  it("meta", () => {
    expect(templatesMeta(0)).toBe("Nothing to start from yet");
    expect(templatesMeta(4)).toBe("4 to start from");
  });
});

describe("shared", () => {
  it("only an explicit grant on someone else.s page is a share", () => {
    expect(isSharedWithMe({ sharedWithMe: true })).toBe(true);
    expect(isSharedWithMe({ sharedWithMe: false })).toBe(false);
    expect(isSharedWithMe({})).toBe(false);
  });
  it("labels", () => {
    expect(roleLabel("EDITOR")).toBe("Can edit");
    expect(roleLabel(null)).toBe("Can view");
    expect(sharedMeta(0)).toBe("Nothing yet");
    expect(sharedMeta(1)).toBe("1 page shared with you");
    expect(sharedMeta(2)).toBe("2 pages shared with you");
  });
});

describe("trash", () => {
  const now = newDate("2026-10-10T12:00:00Z");
  it("keeps 30 days", () => {
    expect(TRASH_DAYS).toBe(30);
    expect(trashDaysLeft("2026-10-10T08:00:00Z", now)).toBe(30);
    expect(trashDaysLeft("2026-10-09T08:00:00Z", now)).toBe(29);
    expect(trashDaysLeft("2026-09-10T12:00:00Z", now)).toBe(0);
    expect(trashDaysLeft("2026-08-01T12:00:00Z", now)).toBe(0);
  });
  it("says when, the way the row always did", () => {
    expect(trashAgo("2026-10-10T11:30:00Z", now, "UTC")).toBe("Just now");
    expect(trashAgo("2026-10-10T03:00:00Z", now, "UTC")).toBe("today");
    expect(trashAgo("2026-10-02T03:00:00Z", now, "UTC")).toBe("2 Oct");
    expect(trashAgo(null, now, "UTC")).toBe("today");
  });
  it("meta line: when, where from, days left", () => {
    expect(trashMeta("2026-10-02T03:00:00Z", now, "UTC", "from Shop")).toBe(
      "Deleted 2 Oct · from Shop · 22 days left"
    );
    expect(trashMeta("2026-09-10T03:00:00Z", now, "UTC")).toBe(
      "Deleted 10 Sep · goes today"
    );
    expect(trashMeta("2026-10-09T03:00:00Z", now, "UTC")).toContain(
      "29 days left"
    );
  });
  it("shows headings only when two kinds share the list", () => {
    expect(trashSections({ pages: 0, tasks: 2, boards: 0 })).toEqual({
      total: 2,
      headings: false,
    });
    expect(trashSections({ pages: 1, tasks: 2, boards: 0 }).headings).toBe(
      true
    );
    expect(trashSections({ pages: 0, tasks: 0, boards: 0 }).total).toBe(0);
  });
});
