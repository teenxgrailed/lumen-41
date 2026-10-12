/**
 * Long titles on the phone's Habits and Moodboards: a title takes the
 * remaining width and ellipsizes. jsdom has no layout, so this reads the
 * style sheets the screens load (the vendored phone-habits / phone-kit and
 * the P9 section of motion.css) and the markup that carries the class.
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "../../../../../..");
const css = (p: string) => readFileSync(join(root, p), "utf8");
const all = [
  css("src/styles/v3/phone-kit.css"),
  css("src/styles/v3/phone-habits.css"),
  css("src/styles/v3-overrides/motion.css"),
].join("\n");

/** The declarations of the first rule whose selector list names `sel`. */
function rule(sel: string): string {
  const re = new RegExp(
    `(?:^|[\\s,}])\\.needt-v3 ${sel.replace(/\./g, "\\.")}\\s*[,{][^}]*\\{([^}]*)\\}|\\.needt-v3 ${sel.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`,
    "m"
  );
  const m = re.exec(all);
  return (m?.[1] ?? m?.[2] ?? "").replace(/\s+/g, " ");
}

const ellipsizes = (d: string) =>
  /overflow:\s*hidden/.test(d) &&
  /text-overflow:\s*ellipsis/.test(d) &&
  /white-space:\s*nowrap/.test(d);

describe("long titles take the remaining width and ellipsize", () => {
  it("a today row (kit row): the text column may shrink and its title ellipsizes", () => {
    expect(rule(".pk-row-main")).toMatch(/min-width:\s*0/);
    expect(ellipsizes(rule(".pk-row-title"))).toBe(true);
    expect(rule(".pk-row-open")).toMatch(/min-width:\s*0/);
  });

  it("a habit's name in the strip is its own box, not bare text in a flex row", () => {
    const d = rule(".phb-habit-title");
    expect(ellipsizes(d)).toBe(true);
    expect(d).toMatch(/min-width:\s*0/);
    expect(d).toMatch(/flex:\s*1/);
    expect(rule(".phb-habit-main")).toMatch(/min-width:\s*0/);
    const src = readFileSync(
      join(root, "src/components/needt3/phone/habits/PhoneHabits.tsx"),
      "utf8"
    );
    expect(src).toMatch(/className="phb-habit-title">\{h\.title\}<\/span>/);
  });

  it("a board card's title and count ellipsize inside a column that may shrink", () => {
    expect(ellipsizes(rule(".phb-board-title"))).toBe(true);
    expect(rule(".phb-board")).toMatch(/min-width:\s*0/);
    expect(rule(".phb-boards")).toMatch(/minmax\(0,\s*1fr\)/);
    expect(ellipsizes(rule(".phb-board-count"))).toBe(true);
  });

  it("a board page's title wraps and the wall's columns may shrink", () => {
    expect(rule(".phb-bh-title")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".phb-col")).toMatch(/min-width:\s*0/);
    expect(ellipsizes(rule(".phb-tile-cap > span:last-child"))).toBe(true);
  });

  it("the P9 section keeps chrome type at 13 px", () => {
    const p9 = css("src/styles/v3-overrides/motion.css").split("P9 · phone")[1];
    expect(p9).toMatch(/\.phb-seg-btn\s*\{\s*font-size:\s*13px/);
  });
});
