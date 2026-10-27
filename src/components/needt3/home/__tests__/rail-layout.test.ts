import { readFileSync } from "fs";
import { join } from "path";

/* Desktop Home keeps ONE right rail: Today, Habits, This week, Today's
 * schedule and Inbox are children of the same aside, and the CSS gives every
 * child the same width (the rail's), the same gap and no margin of its own. */

const root = join(__dirname, "../../../../..");
const css = readFileSync(
  join(root, "src/styles/v3-overrides/ha-home.css"),
  "utf8"
);
const tsx = readFileSync(
  join(root, "src/components/needt3/home/HomeScreen.tsx"),
  "utf8"
);

const rule = (selector: string) => {
  const i = css.indexOf(`${selector} {`);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
};

describe("Home rail", () => {
  it("is one fixed-width column flush with the right gutter", () => {
    expect(rule(".needt-v3 .hd-body")).toMatch(
      /grid-template-columns: minmax\(0, 1fr\) var\(--hd-rail-w, 360px\)/
    );
    const screen = rule(".needt-v3 .hd-home.hd-screen");
    expect(screen).toMatch(/max-width: none/);
    expect(screen).toMatch(/padding-inline: 24px/);
  });

  it("gives every tile the rail's width and one 16 px gap", () => {
    const rail = rule(".needt-v3 .hd-body > .hd-rail");
    expect(rail).toMatch(/flex-direction: column/);
    expect(rail).toMatch(/align-items: stretch/);
    expect(rail).toMatch(/gap: 16px/);
    const tile = rule(".needt-v3 .hd-body > .hd-rail > *");
    expect(tile).toMatch(/width: auto/);
    expect(tile).toMatch(/max-width: none/);
    expect(tile).toMatch(/margin: 0/);
  });

  it("drops the rail under the main column on a narrow screen", () => {
    expect(css).toMatch(
      /@container hdhome \(max-width: 899px\) \{\s*\.needt-v3 \.hd-body \{ grid-template-columns: minmax\(0, 1fr\)/
    );
  });

  it("renders all five tiles inside the single rail aside", () => {
    // the tiles are built once (in the person's order, see home-blocks.ts)
    // and the one aside renders them
    const defs = tsx.slice(tsx.indexOf("const railTiles"));
    expect(defs).toMatch(
      /data-ha-today[\s\S]*data-ha-habits[\s\S]*<HaWeek[\s\S]*<HaSchedule[\s\S]*inbox: inboxTile/
    );
    const from = tsx.indexOf('className="hd-rail"');
    const aside = tsx.slice(from, tsx.indexOf("</aside>", from));
    expect(aside).toContain("railTiles[id]");
    expect(tsx).not.toContain("hd-side");
    expect(tsx.match(/className="hd-rail"/g)).toHaveLength(1);
  });
});
