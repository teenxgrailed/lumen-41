import { rankCommands } from "@/components/pages/page-editor-logic";

const menu = [
  { id: "paragraph", label: "Text", keywords: "paragraph text" },
  { id: "checklist", label: "Checklist", keywords: "todo check task" },
  { id: "taskItem", label: "Task", keywords: "task todo to-do" },
  { id: "link", label: "Task link", keywords: "task link reference" },
  { id: "quote", label: "Quote", keywords: "blockquote" },
];

describe("rankCommands", () => {
  it("an empty query is the whole menu in order", () => {
    expect(rankCommands(menu, "").map((c) => c.id)).toEqual(
      menu.map((c) => c.id)
    );
    expect(rankCommands(menu, "  ")).toHaveLength(menu.length);
  });

  it("/task lands on Task first, then Task link, then keyword matches", () => {
    expect(rankCommands(menu, "task").map((c) => c.id)).toEqual([
      "taskItem",
      "link",
      "checklist",
    ]);
  });

  it("names that start with the query come before names that contain it", () => {
    expect(rankCommands(menu, "t").map((c) => c.id)).toEqual([
      "paragraph",
      "taskItem",
      "link",
      "checklist",
      "quote",
    ]);
  });

  it("drops what does not match, and ignores case", () => {
    expect(rankCommands(menu, "QUO").map((c) => c.id)).toEqual(["quote"]);
    expect(rankCommands(menu, "zzz")).toEqual([]);
  });
});
