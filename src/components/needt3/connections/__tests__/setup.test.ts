import type { CnItem } from "../derive";
import {
  defaultPicks,
  listNames,
  setupRows,
  setupSources,
  setupStatuses,
  shouldAutoOpen,
  tileDepth,
} from "../setup";

const item = (slug: string, state: CnItem["state"] = "none"): CnItem => ({
  slug,
  name: slug,
  description: `${slug} description`,
  category: "calendar",
  native: false,
  configured: true,
  key: slug,
  kind: "app",
  state,
  account: null,
  detail: null,
  accountId: null,
  lastSync: null,
});

describe("setupSources", () => {
  it("leads with the prototype's order, one tile per source, at most twelve, no Needt API", () => {
    const items = [
      item("zoom"),
      item("needt-api"),
      item("notion"),
      item("gmail"),
      { ...item("google-calendar"), key: "google-calendar:a" },
      { ...item("google-calendar"), key: "google-calendar:b" },
      ...Array.from({ length: 12 }, (_, i) => item(`extra-${i}`)),
    ];
    const slugs = setupSources(items).map((i) => i.slug);
    expect(slugs.slice(0, 4)).toEqual([
      "google-calendar",
      "gmail",
      "notion",
      "zoom",
    ]);
    expect(slugs).not.toContain("needt-api");
    expect(slugs).toHaveLength(12);
    expect(new Set(slugs).size).toBe(12);
  });
});

describe("the field", () => {
  it("lays twelve tiles out 5 / 4 / 3 and fewer in fewer rows", () => {
    expect(setupRows(12)).toEqual([5, 4, 3]);
    expect(setupRows(4)).toEqual([4]);
    expect(setupRows(7)).toEqual([4, 3]);
    expect(setupRows(0)).toEqual([]);
    expect(setupRows(10).reduce((a, b) => a + b, 0)).toBe(10);
  });
  it("fades the edge tiles, not the centre", () => {
    expect(tileDepth(2, 5, 0, 3)).toBeLessThan(tileDepth(0, 5, 0, 3));
    expect(tileDepth(1, 3, 1, 3)).toBe(0);
    expect(tileDepth(0, 5, 0, 3)).toBeLessThanOrEqual(1);
  });
});

describe("picks and statuses", () => {
  it("picks a calendar, mail and Apple by default, when they exist", () => {
    expect(
      defaultPicks([item("gmail"), item("notion"), item("icloud-calendar")])
    ).toEqual(["gmail", "icloud-calendar"]);
  });
  it("reads connected from the real cards; the first left is the one to connect", () => {
    const run = {
      picked: ["google-calendar", "gmail", "notion", "linear"],
      skipped: ["gmail"],
    };
    expect(
      setupStatuses(run, [
        item("google-calendar", "connected"),
        item("notion"),
        item("linear"),
      ])
    ).toEqual({
      "google-calendar": "done",
      gmail: "skipped",
      notion: "active",
      linear: "queued",
    });
  });
});

describe("shouldAutoOpen", () => {
  it("opens once the cards are in, while nothing is connected and it was never dismissed", () => {
    expect(shouldAutoOpen([item("gmail")], true, null)).toBe(true);
    expect(shouldAutoOpen([item("gmail")], false, null)).toBe(false);
    expect(shouldAutoOpen([item("gmail")], true, "skipped")).toBe(false);
    expect(shouldAutoOpen([item("gmail", "connected")], true, null)).toBe(
      false
    );
    expect(shouldAutoOpen([item("gmail", "disconnected")], true, null)).toBe(
      false
    );
  });
});

it("lists names the way a sentence does", () => {
  expect(listNames(["Gmail"])).toBe("Gmail");
  expect(listNames(["Gmail", "Drive"])).toBe("Gmail and Drive");
  expect(listNames(["Gmail", "Drive", "Notion"])).toBe(
    "Gmail, Drive and Notion"
  );
});
