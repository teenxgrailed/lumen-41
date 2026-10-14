import {
  BUILTIN_TEMPLATES,
  blocksOf,
  builtinTemplate,
  nodesOf,
  previewOf,
} from "../builtin-templates";

describe("the built-in set", () => {
  it("is the prototype's six, each with a stable id and a free page colour", () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.title)).toEqual([
      "Daily note",
      "Weekly review",
      "Product drop",
      "Meeting notes",
      "Resale listing",
      "Project brief",
    ]);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size).toBe(6);
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.id.startsWith("builtin:")).toBe(true);
      // a backdrop is Pro; a template must be makeable on every plan
      expect(t.style.backdrop).toBe("none");
      expect(builtinTemplate(t.id)).toBe(t);
    }
    expect(builtinTemplate("t1")).toBeUndefined();
  });

  it("says how many blocks the page will have", () => {
    const daily = builtinTemplate("builtin:daily")!;
    // lead, heading, one checklist (two items), heading, paragraph
    expect(nodesOf(daily.body)).toHaveLength(5);
    expect(daily.meta).toBe("Built in · 5 blocks");
  });
});

describe("nodesOf", () => {
  it("joins neighbouring bullets and neighbouring to-dos into one list each", () => {
    const nodes = nodesOf([
      ["li", "In"],
      ["li", "Out"],
      ["todo", "a"],
      ["todo", "b"],
      ["li", "again"],
    ]);
    expect(nodes.map((n) => n.type)).toEqual([
      "bulletList",
      "taskList",
      "bulletList",
    ]);
    expect(nodes[0].content).toHaveLength(2);
    expect(nodes[1].content?.[0]).toMatchObject({
      type: "taskItem",
      attrs: { checked: false },
    });
  });

  it("draws a lead and a callout as the editor's special blocks", () => {
    const [lead, callout] = nodesOf([
      ["lead", "One sentence"],
      ["callout", "Decide first"],
    ]);
    expect(lead).toMatchObject({
      type: "needtPageBlock",
      attrs: { kind: "LEAD" },
    });
    expect(JSON.parse(String(lead.attrs?.data))).toEqual({
      text: "One sentence",
    });
    expect(callout.attrs?.kind).toBe("CALLOUT");
  });

  it("draws a table with a header row", () => {
    const [table] = nodesOf([
      [
        "table",
        [
          ["Brand", "—"],
          ["Size", "—"],
        ],
      ],
    ]);
    expect(table.type).toBe("table");
    expect(table.content).toHaveLength(2);
    expect(table.content?.[0].content?.map((c) => c.type)).toEqual([
      "tableHeader",
      "tableHeader",
    ]);
    expect(table.content?.[1].content?.[0].type).toBe("tableCell");
  });
});

describe("blocksOf", () => {
  it("is what PUT /api/pages/:id/blocks takes: a type, json content and a position", () => {
    const blocks = blocksOf(builtinTemplate("builtin:brief")!.body);
    expect(blocks.map((b) => b.type)).toEqual([
      "LEAD",
      "HEADING_2",
      "BULLETED_LIST",
      "HEADING_2",
      "CHECKLIST",
    ]);
    expect(blocks.map((b) => b.position)).toEqual([
      1024, 2048, 3072, 4096, 5120,
    ]);
    for (const b of blocks) expect(b.content.json.type).toBeTruthy();
  });

  it("stays plain JSON (it is sent as a request body)", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const blocks = blocksOf(t.body);
      expect(JSON.parse(JSON.stringify(blocks))).toEqual(blocks);
    }
  });
});

describe("previewOf", () => {
  it("maps the body to the rows a card draws small, at most eight", () => {
    const rows = previewOf(builtinTemplate("builtin:drop")!.body);
    expect(rows[0]).toEqual({
      type: "callout",
      text: "Drop date, price, quantity — decide these first.",
    });
    expect(rows.map((r) => r.type)).toContain("image");
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(previewOf(builtinTemplate("builtin:listing")!.body)[0]).toEqual({
      type: "p",
      text: "Brand · Size · Condition · Price",
    });
  });
});
