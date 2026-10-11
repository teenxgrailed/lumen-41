import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { LuInfo } from "react-icons/lu";

import { ST_PATHS, StGlyph } from "../StGlyph";

const html = (props: Parameters<typeof StGlyph>[0]) =>
  renderToStaticMarkup(h(StGlyph, props));

describe("StGlyph (the phone's MbStGlyph)", () => {
  it("draws a shared mark as one path per stroke at the size asked", () => {
    const out = html({ name: "cloud-off", size: 16 });
    expect(out).toContain('class="state-glyph-svg"');
    expect(out).toContain('width="16"');
    expect(out.match(/<path /g)).toHaveLength(ST_PATHS["cloud-off"].length);
    expect(out).toContain('aria-hidden="true"');
  });

  it("an unknown name falls back to the icon given, else info", () => {
    const fallback = renderToStaticMarkup(
      h(LuInfo, { size: 16, "aria-hidden": true })
    );
    expect(html({ name: "nope", size: 16 })).toBe(fallback);
    expect(html({ name: "nope", size: 16, fallback: LuInfo })).toBe(fallback);
    expect(html({ name: "nope" })).not.toContain("state-glyph-svg");
  });

  it("every state the surfaces name has a drawing", () => {
    for (const name of ["cloud-off", "lock", "alert", "refresh", "check", "x"])
      expect(ST_PATHS[name].length).toBeGreaterThan(0);
  });
});
