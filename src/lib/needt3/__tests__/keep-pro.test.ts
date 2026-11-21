/**
 * The words of the Keep Pro card (owner 20.11): title and one grey line by
 * plan state, the date, the five or six items, the one footer line. And that
 * the trial emails and the "See plans" actions reach the one card.
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  KEEP_PRO_FOOT,
  keepProCopy,
  keepProDate,
  keepProItems,
} from "../paywall";

describe("keepProCopy", () => {
  it("names the last day of a running trial", () => {
    const c = keepProCopy({
      kind: "trial",
      trialEndsAt: "2026-12-04T09:00:00.000Z",
    });
    expect(c.title).toBe("Keep Pro");
    expect(c.line).toMatch(/^Trial ends (Thu|Fri), \d{1,2} Dec$/);
  });
  it("says the trial has ended on Free once it is spent", () => {
    expect(keepProCopy({ kind: "free", trialEligible: false })).toEqual({
      title: "Keep Pro",
      line: "Your trial has ended",
    });
  });
  it("offers Pro, not Keep Pro, to a Free account that can still start one", () => {
    expect(keepProCopy({ kind: "free", trialEligible: true }).title).toBe(
      "Get Pro"
    );
  });
  it("a paid plan is just Pro", () => {
    expect(keepProCopy({ kind: "yearly" }).title).toBe("Pro");
  });
});

describe("the card", () => {
  it("formats a date and survives a bad one", () => {
    expect(keepProDate("2026-12-04T12:00:00.000Z")).toMatch(/Dec$/);
    expect(keepProDate("nope")).toBe("");
    expect(keepProDate(null)).toBe("");
  });
  it("lists five or six Pro items", () => {
    const n = keepProItems().length;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(6);
  });
  it("the footer never says data is lost", () => {
    expect(KEEP_PRO_FOOT).toBe(
      "Everything you made stays. Pro features become read-only on Free."
    );
    expect(KEEP_PRO_FOOT.toLowerCase()).not.toMatch(/delete|lose|lost|gone/);
  });
});

describe("every Upgrade reaches the one card", () => {
  const read = (...p: string[]) =>
    readFileSync(join(__dirname, "..", "..", "..", ...p), "utf8");
  it("the trial emails link to /upgrade", () => {
    const src = read("lib", "email", "templates", "lifecycle.ts");
    expect(src).toContain('"/upgrade"');
    expect(src).not.toContain("settings#billing");
  });
  it("the habits notice opens the paywall", () => {
    const src = read("components", "needt3", "habits", "HabitsScreen.tsx");
    expect(src).not.toContain("settings#billing");
  });
});
