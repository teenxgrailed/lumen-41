import { importMenuItems } from "../import-sources";

const title = (i: object) => ("title" in i ? i.title : "");
const handlers = () => ({ start: jest.fn(), csv: jest.fn() });

describe("sidebar Import menu rows", () => {
  it("lists the design's rows in order, and always has the CSV", () => {
    expect(importMenuItems(undefined, handlers()).map(title)).toEqual([
      "From Markdown files",
      "From Google Docs",
      "From a calendar file (.ics)",
      "From a CSV of tasks",
    ]);
    const on = importMenuItems(
      {
        enabled: true,
        sources: {
          notion: { configured: true },
          todoist: { configured: true },
        },
      },
      handlers()
    );
    expect(on.map(title)).toEqual([
      "From Markdown files",
      "From Notion",
      "From Todoist",
      "From Google Docs",
      "From a calendar file (.ics)",
      "From a CSV of tasks",
    ]);
  });

  it("does not fake Markdown, Google Docs or .ics: Soon, and off", () => {
    const rows = importMenuItems(undefined, handlers());
    for (const name of [
      "From Markdown files",
      "From Google Docs",
      "From a calendar file (.ics)",
    ]) {
      expect(rows.find((r) => title(r) === name)).toMatchObject({
        disabled: true,
        kbd: "Soon",
      });
    }
  });

  it("runs the CSV picker and the Notion start", () => {
    const h = handlers();
    const rows = importMenuItems(
      { enabled: true, sources: { notion: { configured: true } } },
      h
    );
    const run = (name: string) => {
      const r = rows.find((x) => title(x) === name);
      if (r && "onClick" in r) r.onClick?.();
    };
    run("From a CSV of tasks");
    expect(h.csv).toHaveBeenCalledTimes(1);
    run("From Notion");
    expect(h.start).toHaveBeenCalledWith("notion");
  });
});
