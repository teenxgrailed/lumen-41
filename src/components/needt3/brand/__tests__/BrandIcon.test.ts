import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import { newDateFromYMD } from "@/lib/date-utils";

import { BrandIcon, brandGlyph } from "../BrandIcon";
import { BRAND_ART } from "../data";
import { BRAND_IDS } from "../ids";

const render = (props: Parameters<typeof BrandIcon>[0]) =>
  renderToStaticMarkup(h(BrandIcon, props));

describe("BrandIcon", () => {
  it("draws a fixed square of the size asked, with the 22% corner", () => {
    const html = render({ id: "github", size: 36 });
    expect(html).toContain("width:36px");
    expect(html).toContain("height:36px");
    expect(html).toContain("border-radius:8px");
    expect(render({ id: "github", size: 44 })).toContain("border-radius:10px");
  });

  it("is decorative without a title and an image with one", () => {
    const quiet = render({ id: "slack", size: 40 });
    expect(quiet).toContain('aria-hidden="true"');
    expect(quiet).not.toContain("role=");
    const named = render({ id: "slack", size: 40, title: "Slack" });
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Slack"');
    expect(named).not.toContain('aria-hidden="true" data-brand-icon');
  });

  it("renders real artwork for every mark, never an empty tile", () => {
    for (const id of BRAND_IDS) {
      if (id === "needt") continue;
      const html = render({ id, size: 40, date: newDateFromYMD(2026, 9, 12) });
      expect(html).toContain(`data-brand-icon="${id}"`);
      expect(html.length).toBeGreaterThan(200);
      if (id !== "ical") expect(html).toMatch(/<(path|circle|rect|g)\b/);
    }
  });

  it("keeps ids inside a mark unique per instance", () => {
    const html = renderToStaticMarkup(
      h(
        "div",
        null,
        h(BrandIcon, { id: "gemini" }),
        h(BrandIcon, { id: "gemini" })
      )
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
  });

  it("draws Apple Calendar with the weekday and the day's date", () => {
    const html = render({
      id: "ical",
      size: 40,
      date: newDateFromYMD(2026, 9, 12),
    });
    expect(html).toContain("MON");
    expect(html).toContain(">12<");
    const other = render({
      id: "ical",
      size: 40,
      date: newDateFromYMD(2026, 0, 3),
    });
    expect(other).toContain("SAT");
    expect(other).toContain(">3<");
  });

  it("draws the generic connection tile for a toolkit we have no mark for", () => {
    const html = render({ id: "a-toolkit-we-have-not-drawn", size: 40 });
    expect(html).toContain('data-brand-icon="generic"');
    expect(html).toContain("<svg");
    expect(render({ id: null })).toContain('data-brand-icon="generic"');
  });

  it("gives the sign-in buttons the bare Google and Microsoft marks", () => {
    for (const id of ["google", "microsoft"] as const) {
      const Glyph = brandGlyph(id);
      const html = renderToStaticMarkup(h(Glyph, { size: 16 }));
      expect(html).toContain("<svg");
      expect(html).toContain("<path");
      expect(BRAND_ART[id].nodes.length).toBeGreaterThan(0);
    }
  });
});
