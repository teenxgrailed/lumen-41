/**
 * Why a long subject plus the Task chip cannot push the row wider than the
 * screen, or squeeze the sender to nothing. Read the way the browser reads the
 * sheets: the vendored kit and mail files first, motion.css after them.
 *
 * The chain from the row to the text: .pk-row (flex) > .pk-row-open (flex: 1,
 * min-width: 0) > .pk-row-main (flex: 1, min-width: 0) > the title (clipped,
 * nowrap, ellipsis) and the meta line (flex, clipped) > the chip (flex: none)
 * beside the subject (min-width: 0, ellipsis). Breaking any one link makes the
 * text keep its full width.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const root = join(__dirname, "../../../../../styles");
const read = (f: string) => readFileSync(join(root, f), "utf8");

function decl(css: string, selector: string, prop: string) {
  let out: string | undefined;
  postcss.parse(css).walkRules((r) => {
    if (r.parent?.type !== "root") return;
    if (!r.selectors.includes(selector)) return;
    r.walkDecls(prop, (d) => void (out = d.value));
  });
  return out;
}

describe("phone Mailbox row fit", () => {
  const kit = read("v3/phone-kit.css");
  const mail = read("v3/phone-mail.css");
  const motion = read("v3-overrides/motion.css");
  const k = (s: string, p: string) => decl(kit, `.needt-v3 ${s}`, p);

  it("the open button takes the remaining width and may shrink below its text", () => {
    expect(k(".pk-row-open", "flex")).toBe("1");
    expect(k(".pk-row-open", "min-width")).toBe("0");
    expect(k(".pk-row-main", "flex")).toBe("1");
    expect(k(".pk-row-main", "min-width")).toBe("0");
  });

  it("the sender is clipped to one line with an ellipsis", () => {
    expect(k(".pk-row-title", "overflow")).toBe("hidden");
    expect(k(".pk-row-title", "text-overflow")).toBe("ellipsis");
    expect(k(".pk-row-title", "white-space")).toBe("nowrap");
  });

  it("the time never shrinks, the meta line clips and the subject ellipsizes beside a fixed chip", () => {
    expect(k(".pk-row-time", "flex")).toBe("none");
    expect(k(".pk-row-meta", "overflow")).toBe("hidden");
    expect(k(".pk-row-meta", "min-width")).toBe("0");
    expect(decl(mail, ".needt-v3 .pml-subject", "min-width")).toBe("0");
    expect(decl(mail, ".needt-v3 .pml-subject", "text-overflow")).toBe(
      "ellipsis"
    );
    expect(decl(mail, ".needt-v3 .pml-tag", "flex")).toBe("none");
  });

  it("the unread override restyles the row without touching its widths", () => {
    const touched = new Set<string>();
    postcss.parse(motion).walkRules((r) => {
      // the dot (::before) is its own 8px box; only the row's own boxes count
      if (!r.selector.includes("data-pml-unread")) return;
      if (r.selector.includes("::")) return;
      r.walkDecls((d) => void touched.add(d.prop));
    });
    for (const p of ["flex", "width", "min-width", "max-width", "overflow"])
      expect(touched.has(p)).toBe(false);
  });
});
