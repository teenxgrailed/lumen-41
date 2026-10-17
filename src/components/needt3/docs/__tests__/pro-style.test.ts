import {
  FREE_PAGE_COLOURS,
  FREE_STYLE_VALUES,
  PRO_STYLE_KEYS,
  isProStyleValue,
  proStyleChanges,
} from "@/components/needt3/docs/pro-style";
import {
  DOC_FONTS,
  DOC_PAGES,
  DOC_PRESETS,
  presetPatch,
} from "@/components/needt3/docs/style";

const style = (extra: Record<string, unknown> = {}) => ({
  backdrop: "none",
  page: "white",
  text: "auto",
  separator: "line",
  font: "sans",
  wide: false,
  ...extra,
});

describe("what is free", () => {
  it("is three page colours that are real page colours", () => {
    expect(FREE_PAGE_COLOURS).toHaveLength(3);
    const ids = DOC_PAGES.map((p) => p.id);
    for (const id of FREE_PAGE_COLOURS) expect(ids).toContain(id);
    // The default page is free, so a new page is never a Pro page.
    expect(FREE_PAGE_COLOURS).toContain("white");
  });

  it("gates backdrop, page colour and cover, and no font", () => {
    expect([...PRO_STYLE_KEYS]).toEqual(["backdrop", "page", "cover"]);
    expect(FREE_STYLE_VALUES.backdrop).toEqual(["none"]);
    for (const font of DOC_FONTS) {
      expect(proStyleChanges(style(), style({ font: font.id }))).toEqual([]);
    }
  });

  it("reads values the way the panel does", () => {
    expect(isProStyleValue("backdrop", "none")).toBe(false);
    expect(isProStyleValue("backdrop", "ink")).toBe(true);
    expect(isProStyleValue("page", "paper")).toBe(false);
    expect(isProStyleValue("page", "rose")).toBe(true);
    expect(isProStyleValue("cover", null)).toBe(false);
    expect(isProStyleValue("cover", "")).toBe(false);
    expect(isProStyleValue("cover", "art:rose")).toBe(true);
    expect(isProStyleValue("cover", "https://x.test/a.png")).toBe(true);
  });
});

describe("proStyleChanges", () => {
  it("names each Pro key a write moves to a Pro value", () => {
    expect(
      proStyleChanges(style(), style({ backdrop: "ink", page: "rose" }), {
        after: "art:sage",
      })
    ).toEqual(["backdrop", "page", "cover"]);
  });

  it("ignores a value kept as it was and a move back to a free one", () => {
    const pro = style({ backdrop: "ink", page: "rose" });
    expect(
      proStyleChanges(pro, style({ ...pro, font: "serif" }), {
        before: "art:sage",
        after: "art:sage",
      })
    ).toEqual([]);
    expect(
      proStyleChanges(pro, style(), { before: "art:sage", after: null })
    ).toEqual([]);
  });

  it("treats a write that does not mention the cover as leaving it alone", () => {
    expect(
      proStyleChanges(style(), style({ font: "mono" }), {
        before: "art:sage",
      })
    ).toEqual([]);
    expect(proStyleChanges(style(), style({ font: "mono" }))).toEqual([]);
  });

  it("calls a swap of one Pro value for another a change", () => {
    expect(
      proStyleChanges(style({ page: "rose" }), style({ page: "sage" }))
    ).toEqual(["page"]);
    expect(
      proStyleChanges(style(), style(), { before: "art:a", after: "art:b" })
    ).toEqual(["cover"]);
  });

  it("makes every preset but Default a Pro change", () => {
    const doc = { coverUrl: null, style: style() };
    for (const preset of DOC_PRESETS) {
      const patch = presetPatch(doc, preset.id)!;
      const keys = proStyleChanges(doc.style, patch.style);
      if (preset.id === "default") expect(keys).toEqual([]);
      else expect(keys.length).toBeGreaterThan(0);
    }
  });
});
