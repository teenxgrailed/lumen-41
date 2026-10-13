/**
 * Long titles on the phone's Habits and Moodboards: a title takes the
 * remaining width and ellipsizes. jsdom has no layout, so this reads the
 * style sheets the screens load (the vendored phone-habits / phone-kit and
 * the P9 section of motion.css) and the markup that carries the class.
 */
import { readFileSync } from "fs";

const kitCss = readFileSync("src/styles/v3/phone-kit.css", "utf8");
const habitsCss = readFileSync("src/styles/v3/phone-habits.css", "utf8");
const motionCss = readFileSync("src/styles/v3-overrides/motion.css", "utf8");
const habitsSrc = readFileSync(
  "src/components/needt3/phone/habits/PhoneHabits.tsx",
  "utf8"
);
const all = [kitCss, habitsCss, motionCss].join("\n");

/**
 * The declarations of the first rule that lists `.needt-v3 <sel>` as one of
 * its selectors, found by scanning (no pattern built from `sel`).
 */
function rule(sel: string, css: string = all): string {
  const needle = `.needt-v3 ${sel}`;
  let from = 0;
  for (;;) {
    const at = css.indexOf(needle, from);
    if (at < 0) return "";
    from = at + needle.length;
    const next = css[from];
    // `.phb-board` must not match `.phb-board-title`
    if (next !== " " && next !== "," && next !== "{" && next !== "\n") continue;
    const open = css.indexOf("{", at);
    const close = css.indexOf("}", open);
    const head = css.slice(at, open);
    // the selector must end the head or sit in a comma list, not be a
    // descendant prefix (`.a .b` when we asked for `.a`)
    const listed = head
      .split(",")
      .map((h) => h.trim())
      .includes(needle);
    if (!listed) continue;
    return css.slice(open + 1, close).replace(/\s+/g, " ");
  }
}

const ellipsizes = (d: string) =>
  d.includes("overflow: hidden") &&
  d.includes("text-overflow: ellipsis") &&
  d.includes("white-space: nowrap");

describe("long titles take the remaining width and ellipsize", () => {
  it("a today row (kit row): the text column may shrink and its title ellipsizes", () => {
    expect(rule(".pk-row-main")).toContain("min-width: 0");
    expect(ellipsizes(rule(".pk-row-title"))).toBe(true);
    expect(rule(".pk-row-open")).toContain("min-width: 0");
  });

  it("a habit's name in the strip is its own box, not bare text in a flex row", () => {
    const d = rule(".phb-habit-title");
    expect(ellipsizes(d)).toBe(true);
    expect(d).toContain("min-width: 0");
    expect(d).toContain("flex: 1");
    expect(rule(".phb-habit-main")).toContain("min-width: 0");
    expect(habitsSrc).toContain('className="phb-habit-title">{h.title}</span>');
  });

  it("a board card's title and count ellipsize inside a column that may shrink", () => {
    expect(ellipsizes(rule(".phb-board-title"))).toBe(true);
    expect(rule(".phb-board")).toContain("min-width: 0");
    expect(rule(".phb-boards")).toContain("minmax(0, 1fr)");
    expect(ellipsizes(rule(".phb-board-count"))).toBe(true);
  });

  it("a board page's title wraps and the wall's columns may shrink", () => {
    expect(rule(".phb-bh-title")).toContain("overflow-wrap: anywhere");
    expect(rule(".phb-col")).toContain("min-width: 0");
    expect(ellipsizes(rule(".phb-tile-cap > span:last-child"))).toBe(true);
  });

  it("the P9 section keeps chrome type at 13 px", () => {
    const p9 = motionCss.split("P9 · phone")[1];
    expect(rule(".phb-seg-btn", p9)).toContain("font-size: 13px");
  });
});
