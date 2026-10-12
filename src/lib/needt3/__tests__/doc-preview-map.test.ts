import { type ApiPage, docFromApi, previewFromApi } from "@/lib/needt3/map";

const page = (over: Partial<ApiPage> = {}): ApiPage => ({
  id: "p1",
  title: "Plan",
  ...over,
});

describe("docFromApi preview", () => {
  it("carries the server's preview rows onto the doc", () => {
    const doc = docFromApi(
      page({
        preview: [
          { type: "h2", text: "Scope" },
          { type: "todo", text: "Done", checked: true },
          { type: "todo", text: "Open" },
          { type: "rule", text: "" },
        ],
      })
    );
    expect(doc.preview).toEqual([
      { type: "h2", text: "Scope" },
      { type: "todo", text: "Done", checked: true },
      { type: "todo", text: "Open" },
      { type: "rule", text: "" },
    ]);
  });

  it("leaves preview off when the route sent none, and keeps [] for an empty page", () => {
    expect("preview" in docFromApi(page())).toBe(false);
    expect("preview" in docFromApi(page({ preview: "nope" }))).toBe(false);
    expect(docFromApi(page({ preview: [] })).preview).toEqual([]);
  });

  it("does not disturb the fields the grid already read", () => {
    const base = docFromApi(page({ isFavorite: true, projectId: "ops" }));
    const withPreview = docFromApi(
      page({ isFavorite: true, projectId: "ops", preview: [] })
    );
    const { preview, ...rest } = withPreview;
    expect(preview).toEqual([]);
    expect(rest).toEqual(base);
  });
});

describe("previewFromApi", () => {
  it("keeps only rows it knows how to draw, as plain text", () => {
    expect(
      previewFromApi([
        { type: "p", text: "ok" },
        { type: "script", text: "alert(1)" },
        { type: "html", text: "<b>x</b>", html: "<b>x</b>" },
        { type: "p", text: 42 },
        { type: "li" },
        { type: "p", text: "" },
        null,
        "string",
        { type: "rule", text: "ignored words" },
        { type: "p", text: "x".repeat(500) },
        { type: "p", text: "not todo", checked: true },
      ])
    ).toEqual([
      { type: "p", text: "ok" },
      { type: "rule", text: "" },
      { type: "p", text: "x".repeat(120) },
      { type: "p", text: "not todo" },
    ]);
  });

  it("caps the rows", () => {
    const rows = Array.from({ length: 40 }, () => ({ type: "p", text: "x" }));
    expect(previewFromApi(rows)).toHaveLength(8);
  });
});
