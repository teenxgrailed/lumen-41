import {
  DOC_DEFAULT,
  contrast,
  inkFor,
  pageVars,
  presetOf,
  presetPatch,
  rgbOf,
  styleOf,
  stylePatch,
} from "../style";

const TOKENS: Record<string, string> = {
  "--doc-ink-dark": "#1c1d20",
  "--doc-ink-light": "#f4f4f5",
  "--doc-page-white-l": "#ffffff",
  "--doc-page-white-d": "#1e1f22",
  "--doc-page-black-l": "#111111",
  "--doc-page-black-d": "#0b0b0c",
  "--doc-page-rose-l": "#f8e8ea",
  "--doc-page-rose-d": "#3a2629",
  "--doc-text-wine-dk": "#6b1f33",
  "--doc-text-wine-lt": "#f2b8c6",
};
const read = (name: string) => TOKENS[name] ?? "";

describe("styleOf", () => {
  it("is the default with no doc or no style", () => {
    expect(styleOf(null)).toEqual(DOC_DEFAULT);
    expect(styleOf({ coverUrl: null, style: null })).toEqual(DOC_DEFAULT);
  });

  it("reads a real style and the cover from coverUrl", () => {
    const s = styleOf({
      coverUrl: "/api/pages/p1/assets/a1",
      style: { backdrop: "dunes", page: "rose", font: "serif" },
    });
    expect(s).toMatchObject({
      backdrop: "dunes",
      page: "rose",
      font: "serif",
      text: "auto",
      cover: "/api/pages/p1/assets/a1",
    });
  });

  it("reads a legacy theme as its preset, and a ground as a backdrop", () => {
    expect(
      styleOf({ coverUrl: null, style: { theme: "ocean" } })
    ).toMatchObject({ backdrop: "ocean", page: "sky", text: "navy" });
    expect(
      styleOf({ coverUrl: null, style: { ground: "stone" } })
    ).toMatchObject({ backdrop: "grid", page: "white" });
  });
});

describe("stylePatch", () => {
  it("writes the whole style, moves the cover out and keeps legacy keys", () => {
    const doc = {
      coverUrl: "/c.jpg",
      style: { theme: "rose", ground: "sand" },
    };
    const out = stylePatch(doc, { font: "mono" });
    expect(out.coverUrl).toBe("/c.jpg");
    expect(out.style).toMatchObject({
      backdrop: "dunes",
      page: "rose",
      font: "mono",
      theme: "rose",
      ground: "sand",
    });
    expect(out.style).not.toHaveProperty("cover");
  });

  it("removes the cover", () => {
    expect(
      stylePatch({ coverUrl: "/c.jpg", style: null }, { cover: null })
    ).toMatchObject({ coverUrl: null });
  });
});

describe("presets", () => {
  it("finds the preset a style matches, or none", () => {
    expect(presetOf({ ...DOC_DEFAULT })?.id).toBe("default");
    expect(presetOf({ ...DOC_DEFAULT, font: "mono" })).toBeNull();
  });

  it("applies a preset's four keys and its theme id", () => {
    const out = presetPatch(
      { coverUrl: null, style: { backdrop: "none", wide: true } },
      "night"
    );
    expect(out?.style).toMatchObject({
      backdrop: "ink",
      page: "black",
      wide: true,
      theme: "night",
    });
  });

  it("Sparkles keeps the theme id the doc had (it has none of its own)", () => {
    const out = presetPatch(
      { coverUrl: null, style: { theme: "sage" } },
      "sparkles"
    );
    expect(out?.style).toMatchObject({ backdrop: "sparkle", theme: "sage" });
    expect(presetPatch({ coverUrl: null, style: null }, "nope")).toBeNull();
  });
});

describe("ink", () => {
  it("auto picks the ink that reads on the page", () => {
    expect(inkFor("#ffffff", "auto", read)).toBe("#1c1d20");
    expect(inkFor("#111111", "auto", read)).toBe("#f4f4f5");
  });

  it("a hue takes its deep reading on a light page, its pale one on a dark", () => {
    expect(inkFor("#f8e8ea", "wine", read)).toBe("#6b1f33");
    expect(inkFor("#3a2629", "wine", read)).toBe("#f2b8c6");
    expect(contrast("#f8e8ea", "#6b1f33")).toBeGreaterThanOrEqual(4.5);
  });

  it("dark and light are taken as asked", () => {
    expect(inkFor("#111111", "dark", read)).toBe("#1c1d20");
    expect(inkFor("#ffffff", "light", read)).toBe("#f4f4f5");
  });

  it("pageVars builds both sides, and nothing before tokens load", () => {
    const v = pageVars({ ...DOC_DEFAULT, page: "rose", text: "wine" }, read);
    expect(v).toEqual({
      "--dt-page-l": "#f8e8ea",
      "--dt-page-d": "#3a2629",
      "--dt-ink-l": rgbOf("#6b1f33"),
      "--dt-ink-d": rgbOf("#f2b8c6"),
      "--dt-head-l": "#6b1f33",
      "--dt-head-d": "#f2b8c6",
    });
    expect(pageVars(DOC_DEFAULT, () => "")).toEqual({});
    expect(rgbOf("#102030")).toBe("16, 32, 48");
  });
});
