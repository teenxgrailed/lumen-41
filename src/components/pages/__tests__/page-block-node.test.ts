import { pageEditorSchema } from "@/lib/pages/page-editor-schema";

/**
 * Stored block attrs are untrusted (imports, API writes). Whatever the data
 * says, the rendered block only gets an href / src that passes the shared
 * URL allowlist.
 */

type DomSpec = string | null | undefined | DomSpec[] | Record<string, unknown>;

function render(kind: string, data: Record<string, unknown>): DomSpec {
  const node = pageEditorSchema.nodeFromJSON({
    type: "needtPageBlock",
    attrs: { kind, data: JSON.stringify(data) },
  });
  const toDOM = pageEditorSchema.nodes.needtPageBlock.spec.toDOM;
  if (!toDOM) throw new Error("needtPageBlock has no toDOM");
  return toDOM(node) as DomSpec;
}

/** Every attribute value in the spec, by name. */
function attributes(spec: DomSpec, name: string): string[] {
  const found: string[] = [];
  const walk = (value: DomSpec) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object" && name in value) {
      found.push(String(value[name]));
    }
  };
  walk(spec);
  return found;
}

describe("PageBlockNode renderHTML", () => {
  it.each(["BOOKMARK", "LINK", "FILE", "PAGE_MENTION"])(
    "%s draws no link for javascript:, data:, vbscript: or a protocol-relative address",
    (kind) => {
      for (const url of [
        "javascript:alert(1)",
        "JAVASCRIPT:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "//evil.example/x",
        "/\\evil.example/x",
        "java\tscript:alert(1)",
      ]) {
        const spec = render(kind, { url, title: "Click me" });
        expect(attributes(spec, "href")).toEqual([]);
        expect(attributes(spec, "src")).toEqual([]);
      }
    }
  );

  it("IMAGE draws no img for javascript:, data: or mailto:", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "mailto:a@b.co",
    ]) {
      expect(attributes(render("IMAGE", { url, name: "x" }), "src")).toEqual(
        []
      );
    }
  });

  it("keeps http, https, mailto and Needt paths", () => {
    const href = (kind: string, url: string) =>
      attributes(render(kind, { url, title: "t" }), "href");
    expect(href("BOOKMARK", "https://example.com/a")).toEqual([
      "https://example.com/a",
    ]);
    expect(href("LINK", "http://example.com/a")).toEqual([
      "http://example.com/a",
    ]);
    expect(href("LINK", "mailto:a@b.co")).toEqual(["mailto:a@b.co"]);
    expect(href("PAGE_MENTION", "/pages/abc")).toEqual(["/pages/abc"]);
    expect(href("FILE", "/api/pages/p/assets/a")).toEqual([
      "/api/pages/p/assets/a",
    ]);
    expect(
      attributes(
        render("IMAGE", { url: "/api/pages/p/assets/a", name: "x" }),
        "src"
      )
    ).toEqual(["/api/pages/p/assets/a"]);
  });

  it("keeps task and project references that link into the app", () => {
    expect(
      attributes(
        render("TASK_REFERENCE", { url: "/tasks?taskId=t1", title: "T" }),
        "href"
      )
    ).toEqual(["/tasks?taskId=t1"]);
    expect(
      attributes(
        render("PROJECT_REFERENCE", { url: "/projects/p1", title: "P" }),
        "href"
      )
    ).toEqual(["/projects/p1"]);
  });
});
