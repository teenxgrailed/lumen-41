import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(
  path.join(__dirname, "../v3-overrides/ha-home.css"),
  "utf8"
);

/** The block that holds the phone Today rules added in the 22.11.26 audit. */
const audit = css.slice(css.indexOf("Phone Today: one rhythm"));

describe("phone Today rhythm", () => {
  it("the stacked cards share one literal radius", () => {
    // --ha-r-row is only defined inside .ha-phone; the overdue row sits outside
    // it, so a var() there computes to no radius at all (a square row).
    expect(audit).not.toMatch(/hv2-late-main[^}]*var\(--ha-r-row\)/);
    expect(audit).toMatch(
      /\.ha-ph-stack > \.ha-card,[\s\S]*?\.hv2-late-main \{ border-radius: 14px; \}/
    );
  });

  it("a section label is sentence case, not an uppercase eyebrow", () => {
    expect(audit).toMatch(/\.pk-label \{[^}]*text-transform: none/);
  });

  it("a row title is the 16 px phone row type and may take two lines", () => {
    expect(audit).toMatch(/\.v2p-day \.pk-row-title \{[^}]*500 16px\/22px/);
    expect(audit).toMatch(/-webkit-line-clamp: 2/);
  });
});
