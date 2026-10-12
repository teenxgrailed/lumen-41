import {
  FlattenTracker,
  type PlannedProperty,
  mapPropertyValue,
  pageTitle,
  planProperties,
} from "../notion/properties";
import { ID, dataSource, rowA, rowB } from "./fixtures/notion/workspace";

const TITLES: Record<string, string> = { [ID.roadmap]: "Roadmap" };

function mapRow(page = rowA) {
  const { properties } = planProperties(dataSource);
  const flatten = new FlattenTracker();
  const out = new Map<string, ReturnType<typeof mapPropertyValue>>();
  for (const property of properties) {
    out.set(
      property.name,
      mapPropertyValue(property, page.properties?.[property.key], {
        titleOf: (id) => TITLES[id] ?? null,
        flatten,
      })
    );
  }
  return { properties, out, flatten };
}

describe("Notion database properties", () => {
  it("plans every property type with the title first and buttons left out", () => {
    const { properties, skipped } = planProperties(dataSource);
    const byName = Object.fromEntries(properties.map((p) => [p.name, p]));
    expect(properties[0].name).toBe("Name");
    expect(Object.fromEntries(properties.map((p) => [p.name, p.type]))).toEqual(
      {
        Name: "TITLE",
        Notes: "TEXT",
        Qty: "NUMBER",
        Kind: "SELECT",
        Tags: "MULTI_SELECT",
        State: "SELECT",
        Due: "DATE",
        Done: "CHECKBOX",
        Link: "URL",
        Mail: "EMAIL",
        Phone: "PHONE",
        Owner: "TEXT",
        Parent: "TEXT",
        Total: "TEXT",
        Score: "TEXT",
        Attachments: "FILES",
        Created: "DATE",
        Edited: "DATE",
        Author: "TEXT",
        Editor: "TEXT",
        ID: "TEXT",
      }
    );
    expect(skipped).toEqual([{ name: "Go", notionType: "button" }]);
    expect(byName.Kind.config).toEqual({ options: ["Bug", "Chore"] });
    expect(byName.State.config).toEqual({ options: ["Todo", "Done"] });
    expect(byName.Tags.config).toEqual({ options: ["x", "y"] });
    const flattened = properties
      .filter((p) => p.flattened)
      .map((p) => p.notionType);
    expect(flattened.sort()).toEqual(
      [
        "created_by",
        "formula",
        "last_edited_by",
        "people",
        "relation",
        "rollup",
        "unique_id",
      ].sort()
    );
  });

  it("maps each kind of value", () => {
    const { out } = mapRow();
    const value = (name: string) => out.get(name)?.value;
    expect(value("Name")).toBe("Fix login");
    expect(value("Notes")).toBe("Users cannot sign in");
    expect(value("Qty")).toBe(3);
    expect(value("Kind")).toBe("Bug");
    expect(value("Tags")).toEqual(["x", "y"]);
    expect(value("State")).toBe("Done");
    expect(value("Due")).toBe("2026-10-20");
    expect(value("Done")).toBe(true);
    expect(value("Link")).toBe("https://example.com/issue");
    expect(value("Mail")).toBe("ada@example.com");
    expect(value("Phone")).toBe("+1 555 0100");
    expect(value("Created")).toBe("2026-09-01T08:00:00.000Z");
    expect(value("Edited")).toBe("2026-10-01T10:00:00.000Z");
  });

  it("stores people, relation, rollup, formula, created-by and unique id as readable text", () => {
    const { out } = mapRow();
    const value = (name: string) => out.get(name)?.value;
    expect(value("Owner")).toBe("Ada, Grace");
    // A related page that was not imported has no title to show.
    expect(value("Parent")).toBe("Roadmap");
    expect(value("Total")).toBe("2, 5");
    expect(value("Score")).toBe("42");
    expect(value("Author")).toBe("Ada");
    expect(value("Editor")).toBe("Grace");
    expect(value("ID")).toBe("TASK-7");
  });

  it("returns files separately, hosted or external, and leaves empty values out", () => {
    const { out } = mapRow();
    expect(out.get("Attachments")?.files).toEqual([
      {
        name: "log.txt",
        url: expect.stringContaining("amazonaws.com"),
        hosted: true,
      },
      {
        name: "ext.png",
        url: "https://images.example.com/e.png",
        hosted: false,
      },
    ]);
    const empty = mapRow(rowB).out;
    expect(empty.get("Notes")?.value).toBeUndefined();
    expect(empty.get("Qty")?.value).toBeUndefined();
    expect(empty.get("Done")?.value).toBe(false);
    expect(empty.get("Attachments")?.files).toBeUndefined();
  });

  it("names the flattened kinds and the date range once", () => {
    const { flatten } = mapRow();
    const text = flatten.describe();
    for (const kind of [
      "people (Owner)",
      "relation (Parent)",
      "rollup (Total)",
      "formula (Score)",
      "date range, start kept (Due)",
    ]) {
      expect(text).toContain(kind);
    }
  });

  it("reads a page title and falls back to Untitled", () => {
    expect(pageTitle(rowA)).toBe("Fix login");
    expect(pageTitle({ object: "page", id: "x", properties: {} })).toBe(
      "Untitled"
    );
  });

  it("keeps a property that has no known type out rather than guessing", () => {
    const { properties, skipped } = planProperties({
      object: "data_source",
      id: "x",
      properties: { Odd: { name: "Odd", type: "hologram" } },
    });
    expect(properties).toEqual([] as PlannedProperty[]);
    expect(skipped).toEqual([{ name: "Odd", notionType: "hologram" }]);
  });
});
