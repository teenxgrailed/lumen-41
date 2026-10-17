import { TASK_CSV_HEADER, csvField, tasksToCsv } from "../tasks-csv";

describe("csvField", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("plain")).toBe("plain");
  });

  it("neutralises a cell a spreadsheet would run as a formula", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("@sum")).toBe("'@sum");
    expect(csvField("-2")).toBe("'-2");
  });

  it("writes nothing for null and undefined, zero for zero", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(0)).toBe("0");
  });
});

describe("tasksToCsv", () => {
  it("starts with the BOM and the header, ends with a line break", () => {
    const out = tasksToCsv([]);
    expect(out).toBe(`﻿${TASK_CSV_HEADER.join(",")}\r\n`);
  });

  it("writes one row per task in the header's column order", () => {
    const out = tasksToCsv([
      {
        title: "Write, then ship",
        status: "todo",
        project: { name: "Launch" },
        dueDate: new Date("2026-10-20T00:00:00.000Z"),
        estimatedMinutes: 45,
        priority: "high",
        tags: [{ name: "work" }, { name: "deep" }],
        description: "Line one\nLine two",
        completedAt: null,
        createdAt: "2026-10-01T09:00:00.000Z",
      },
    ]);
    const rows = out.replace("﻿", "").split("\r\n");
    expect(rows[1]).toBe(
      [
        '"Write, then ship"',
        "todo",
        "Launch",
        "2026-10-20T00:00:00.000Z",
        "",
        "",
        "45",
        "high",
        "work; deep",
        '"Line one\nLine two"',
        "",
        "2026-10-01T09:00:00.000Z",
      ].join(",")
    );
  });
});
