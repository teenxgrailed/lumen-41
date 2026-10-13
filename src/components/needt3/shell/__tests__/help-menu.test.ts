/**
 * Report a problem and Import (owner feedback 2026-10-13): what they send, and
 * which sources the Import menu offers.
 */
import { bugFacts, bugFormData, bugTitle } from "../bug-report";
import { importItems } from "../import-sources";

const ctx = {
  route: "/today",
  theme: "dark",
  window: "1440 × 900",
  version: "1.2.3",
  browser: "UA",
};

describe("bug report", () => {
  it("titles the report with the first line of what happened", () => {
    expect(bugTitle("  It landed on Wednesday\nand then more ")).toBe(
      "It landed on Wednesday"
    );
  });

  it("cuts a long first line at a word", () => {
    const t = bugTitle(`${"word ".repeat(40)}end`);
    expect(t.length).toBeLessThanOrEqual(81);
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/wor…$/);
  });

  it("sends what happened, what was expected and the shown context", () => {
    const form = bugFormData("It broke", " It should not ", ctx);
    expect(form.get("title")).toBe("It broke");
    expect(form.get("description")).toBe("It broke");
    expect(form.get("expectedBehavior")).toBe("It should not");
    expect(form.get("route")).toBe("/today");
    expect(form.get("viewport")).toBe("1440×900");
    expect(form.get("theme")).toBe("dark");
    expect(form.get("appVersion")).toBe("1.2.3");
    expect(bugFacts(ctx).map(([k]) => k)).toEqual([
      "Screen",
      "Theme",
      "Window",
      "Version",
    ]);
  });

  it("omits an empty expectation", () => {
    expect(bugFormData("It broke", "  ", ctx).has("expectedBehavior")).toBe(
      false
    );
  });
});

describe("import menu sources", () => {
  const start = jest.fn();

  it("offers nothing while imports are off", () => {
    expect(
      importItems(
        { enabled: false, sources: { notion: { configured: true } } },
        start
      )
    ).toEqual([]);
    expect(importItems(undefined, start)).toEqual([]);
  });

  it("offers only the sources the server has set up, Notion first", () => {
    const all = importItems(
      {
        enabled: true,
        sources: {
          notion: { configured: true },
          todoist: { configured: true },
        },
      },
      start
    );
    expect(all.map((i) => ("title" in i ? i.title : ""))).toEqual([
      "From Notion",
      "From Todoist",
    ]);
    const only = importItems(
      { enabled: true, sources: { todoist: { configured: true } } },
      start
    );
    expect(only).toHaveLength(1);
    const item = only[0];
    if ("onClick" in item) item.onClick?.();
    expect(start).toHaveBeenCalledWith("todoist");
  });
});
