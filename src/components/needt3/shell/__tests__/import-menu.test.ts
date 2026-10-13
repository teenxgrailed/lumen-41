import { IMPORT_PROMPT, importRows } from "../import-menu";

const byKind = (rows: ReturnType<typeof importRows>) =>
  Object.fromEntries(rows.map((r) => [r.kind, r]));

describe("sidebar Import menu rows", () => {
  it("lists the five sources of the design, in order", () => {
    expect(IMPORT_PROMPT).toBe("Where would you like to import from?");
    expect(importRows(null).map((r) => r.title)).toEqual([
      "From Markdown files",
      "From Notion",
      "From Google Docs",
      "From a calendar file (.ics)",
      "From a CSV of tasks",
    ]);
  });

  it("backs a tasks CSV always", () => {
    expect(byKind(importRows(null)).csv.backed).toBe(true);
  });

  it("backs Notion only when imports are on and the server has it set up", () => {
    expect(byKind(importRows(null)).notion.backed).toBe(false);
    expect(
      byKind(importRows({ enabled: false, sources: {} })).notion.backed
    ).toBe(false);
    expect(
      byKind(
        importRows({
          enabled: true,
          sources: { notion: { configured: false } },
        })
      ).notion
    ).toMatchObject({ backed: false, note: "Not set up" });
    expect(
      byKind(
        importRows({ enabled: true, sources: { notion: { configured: true } } })
      ).notion.backed
    ).toBe(true);
  });

  it("does not fake Markdown, Google Docs or .ics: they say Soon and are off", () => {
    const rows = byKind(
      importRows({ enabled: true, sources: { notion: { configured: true } } })
    );
    for (const kind of ["markdown", "gdocs", "ics"] as const) {
      expect(rows[kind]).toMatchObject({ backed: false, note: "Soon" });
    }
  });
});
