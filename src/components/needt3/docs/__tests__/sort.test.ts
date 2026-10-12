import { ageLabel } from "../labels";
import { DEFAULT_SORT, dirLabel, nextSort, parseSort, sortDocs } from "../sort";

const doc = (title: string, createdAt: string, updatedAt: string) => ({
  title,
  createdAt,
  updatedAt,
});

const A = doc("beta", "2026-09-01T10:00:00Z", "2026-09-05T10:00:00Z");
const B = doc("Alpha", "2026-09-03T10:00:00Z", "2026-09-02T10:00:00Z");
const C = doc("", "2026-09-02T10:00:00Z", "2026-09-04T10:00:00Z");

describe("sortDocs", () => {
  it("name A→Z ignores case and puts untitled last", () => {
    const out = sortDocs([A, B, C], { key: "name", dir: "asc" });
    expect(out.map((d) => d.title)).toEqual(["Alpha", "beta", ""]);
  });

  it("dates sort newest first by default and flip", () => {
    expect(sortDocs([A, B, C], { key: "updated", dir: "desc" })).toEqual([
      A,
      C,
      B,
    ]);
    expect(sortDocs([A, B, C], { key: "created", dir: "desc" })).toEqual([
      B,
      C,
      A,
    ]);
    expect(sortDocs([A, B, C], { key: "created", dir: "asc" })).toEqual([
      A,
      C,
      B,
    ]);
  });

  it("last viewed falls back to updated, and ties keep their order", () => {
    const D = { ...A, title: "d" };
    expect(sortDocs([A, D, B], { key: "viewed", dir: "desc" })).toEqual([
      A,
      D,
      B,
    ]);
    const seen = { ...B, viewedAt: "2026-09-09T10:00:00Z" };
    expect(sortDocs([A, seen], { key: "viewed", dir: "desc" })[0]).toBe(seen);
  });

  it("a missing stamp sorts as the oldest", () => {
    const none = { title: "x", createdAt: null, updatedAt: null };
    expect(sortDocs([none, A], { key: "updated", dir: "desc" })).toEqual([
      A,
      none,
    ]);
  });

  it("does not mutate the input", () => {
    const list = [A, B, C];
    sortDocs(list, { key: "name", dir: "asc" });
    expect(list).toEqual([A, B, C]);
  });
});

describe("sort choice", () => {
  it("the active key flips, another key takes its default", () => {
    expect(nextSort({ key: "updated", dir: "desc" }, "updated")).toEqual({
      key: "updated",
      dir: "asc",
    });
    expect(nextSort({ key: "updated", dir: "asc" }, "name")).toEqual({
      key: "name",
      dir: "asc",
    });
    expect(nextSort({ key: "name", dir: "asc" }, "created")).toEqual({
      key: "created",
      dir: "desc",
    });
  });

  it("labels say what the direction means", () => {
    expect(dirLabel("name", "asc")).toBe("A to Z");
    expect(dirLabel("updated", "desc")).toBe("Newest first");
  });

  it("parses the stored value, defaulting on anything malformed", () => {
    expect(parseSort('{"key":"name","dir":"desc"}')).toEqual({
      key: "name",
      dir: "desc",
    });
    expect(parseSort('{"key":"size","dir":"desc"}')).toEqual(DEFAULT_SORT);
    expect(parseSort("{oops")).toEqual(DEFAULT_SORT);
    expect(parseSort(null)).toEqual(DEFAULT_SORT);
  });
});

describe("ageLabel", () => {
  const now = Date.parse("2026-09-05T12:00:00Z");
  it("reads minutes, hours, yesterday and dates", () => {
    expect(ageLabel("2026-09-05T11:59:40Z", now)).toBe("Just now");
    expect(ageLabel("2026-09-05T11:40:00Z", now)).toBe("20 min ago");
    expect(ageLabel(null, now)).toBe("");
    expect(ageLabel("2026-08-02T12:00:00Z", now)).toBe("2 Aug");
    expect(ageLabel("2025-08-02T12:00:00Z", now)).toBe("2 Aug 2025");
  });
});
