/**
 * @jest-environment jsdom
 *
 * What the rail's Tasks and Files tabs read: the to-dos and linked tasks of a
 * page as drawn, under the headings they sit in, and a file's kind and size.
 */
import {
  fileKind,
  fileMeta,
  fileSize,
  isMedia,
  taskItemAt,
  tasksOf,
  whereLabel,
} from "../rail-data";

const editor = (html: string) => {
  const el = document.createElement("div");
  el.className = "needt-page-editor";
  el.innerHTML = html;
  return el;
};

const item = (text: string, checked = false, nested = "") =>
  `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${
    checked ? " checked" : ""
  }></label><div><p>${text}</p>${nested}</div></li>`;

describe("tasksOf", () => {
  it("reads every to-do in order with the headings above it", () => {
    const rows = tasksOf(
      editor(
        `<h1>Scope</h1><ul data-type="taskList">${item("Ship the sidebar")}</ul>` +
          `<h2>What ships</h2><ul data-type="taskList">${item("Write the brief", true)}</ul>` +
          `<h1>Open questions</h1><ul data-type="taskList">${item("Decide the door")}</ul>`
      )
    );
    expect(
      rows.map((r) => [r.text, r.done, r.where.join(" › "), r.nth])
    ).toEqual([
      ["Ship the sidebar", false, "Scope", 0],
      ["Write the brief", true, "Scope › What ships", 1],
      ["Decide the door", false, "Open questions", 2],
    ]);
  });

  it("takes a to-do's own text, not the to-dos nested inside it", () => {
    const rows = tasksOf(
      editor(
        `<ul data-type="taskList">${item(
          "Parent",
          false,
          `<ul data-type="taskList">${item("Child")}</ul>`
        )}</ul>`
      )
    );
    expect(rows.map((r) => [r.text, r.nth])).toEqual([
      ["Parent", 0],
      ["Child", 1],
    ]);
  });

  it("skips an empty to-do but still counts its place", () => {
    const rows = tasksOf(
      editor(`<ul data-type="taskList">${item("")}${item("Real")}</ul>`)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nth).toBe(1);
  });

  it("lists a task the page links to, and ignores a reference with no address", () => {
    const rows = tasksOf(
      editor(
        `<h2>Plan</h2>` +
          `<div data-needt-page-block="TASK_REFERENCE"><a href="/tasks/t1">Pay the invoice</a></div>` +
          `<div data-needt-page-block="TASK_REFERENCE"><span>Task</span><span>Empty</span></div>`
      )
    );
    expect(rows).toEqual([
      {
        kind: "link",
        text: "Pay the invoice",
        done: false,
        where: ["Plan"],
        href: "/tasks/t1",
        nth: -1,
      },
    ]);
  });

  it("is empty without a page or without tasks", () => {
    expect(tasksOf(null)).toEqual([]);
    expect(tasksOf(editor("<h1>Only a heading</h1><p>text</p>"))).toEqual([]);
  });

  it("finds the nth to-do's element for ticking", () => {
    const ed = editor(`<ul data-type="taskList">${item("a")}${item("b")}</ul>`);
    expect(taskItemAt(ed, 1)?.textContent).toBe("b");
    expect(taskItemAt(ed, 5)).toBeNull();
    expect(taskItemAt(null, 0)).toBeNull();
  });

  it("says where a row is", () => {
    expect(whereLabel({ where: ["A", "B"], kind: "item" })).toBe("A › B");
    expect(whereLabel({ where: [], kind: "item" })).toBe("");
    expect(whereLabel({ where: [], kind: "link" })).toBe("Task");
  });
});

describe("files", () => {
  it("names a kind from the mime type or the extension", () => {
    expect(fileKind("a.pdf", "application/pdf")).toBe("PDF");
    expect(fileKind("prices.csv", "text/csv")).toBe("CSV");
    expect(fileKind("shot.png", "image/png")).toBe("Image");
    expect(fileKind("notes.docx", "application/octet-stream")).toBe("Word");
    expect(fileKind("weird.abc", "application/octet-stream")).toBe("ABC");
    expect(fileKind("README", "application/octet-stream")).toBe("File");
  });

  it("writes a size", () => {
    expect(fileSize(812)).toBe("812 B");
    expect(fileSize(240 * 1024)).toBe("240 KB");
    expect(fileSize(1.4 * 1024 * 1024)).toBe("1.4 MB");
    expect(fileSize(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("the second line of a row is kind and size", () => {
    expect(
      fileMeta({
        name: "sidebar-spec.pdf",
        mimeType: "application/pdf",
        size: 240 * 1024,
      })
    ).toBe("PDF · 240 KB");
  });

  it("pictures are Media, except SVG (which can carry script)", () => {
    expect(isMedia({ mimeType: "image/jpeg" })).toBe(true);
    expect(isMedia({ mimeType: "image/svg+xml" })).toBe(false);
    expect(isMedia({ mimeType: "application/pdf" })).toBe(false);
  });
});
