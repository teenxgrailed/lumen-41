/**
 * The project flow and the "Add a task" line, pinned in the CSS text. The
 * vendored sheets are never edited; this override loads after them.
 */
import { readFileSync } from "node:fs";
import postcss, { type Rule } from "postcss";

const SRC = readFileSync("src/styles/v3-overrides/project-flow.css", "utf8");
const root = postcss.parse(SRC);
const entry = readFileSync("src/styles/v3-entry.css", "utf8");

const norm = (selector: string) => selector.replace(/\s+/g, " ").trim();

/** The declarations of every top-level rule whose selector list contains `selector`. */
function decls(selector: string) {
  const out: Record<string, string> = {};
  root.walkRules((rule: Rule) => {
    if (rule.parent?.type !== "root") return;
    if (!rule.selectors.map(norm).includes(selector)) return;
    rule.walkDecls((d) => {
      out[d.prop] = d.value;
    });
  });
  return out;
}

describe("project-flow.css", () => {
  it("loads after the vendored sheets", () => {
    const at = (name: string) => entry.indexOf(name);
    expect(at("project-flow.css")).toBeGreaterThan(at("./v3/index.css"));
  });

  it("gives the add line one ring: the label draws it, the input does not", () => {
    const focus = decls(".needt-v3 .wk-padd:focus-within");
    expect(focus["box-shadow"]).toContain("var(--shadow-focus)");
    const input = decls(".needt-v3 .wk-padd .wk-padd-input:focus-visible");
    expect(input["box-shadow"]).toBe("none");
    expect(input.outline).toBe("none");
    // every state change is a short fade, not a jump
    expect(decls(".needt-v3 .wk-padd").transition).toContain(
      "box-shadow 120ms"
    );
  });

  it("has hover and disabled states, and a hint that fades instead of mounting", () => {
    expect(decls(".needt-v3 .wk-padd:hover")["box-shadow"]).toContain(
      "var(--fill-5)"
    );
    const disabled = decls('.needt-v3 .wk-padd[aria-disabled="true"]');
    expect(disabled.opacity).toBe("0.4");
    expect(disabled.cursor).toBe("not-allowed");
    expect(decls(".needt-v3 .wk-padd-hint").opacity).toBe("0");
    expect(decls(".needt-v3 .wk-padd[data-filled] .wk-padd-hint").opacity).toBe(
      "1"
    );
  });

  it("keeps accent a mark: never a solid fill, and no 14px chrome type", () => {
    root.walkDecls((d) => {
      if (/^background(-color)?$/.test(d.prop))
        expect(d.value).not.toMatch(/accent/);
      if (d.prop === "font") expect(d.value).not.toMatch(/(^|\s)14px/);
    });
  });

  it("joins the checks with the hairline and greys the blocked mark", () => {
    expect(decls(".needt-v3 .wk-step + .wk-step::before").background).toBe(
      "var(--fill-5)"
    );
    expect(decls(".needt-v3 .wk-wait::before").background).toBe(
      "var(--text-muted)"
    );
  });

  it("an empty Project chip carries no plus", () => {
    const rule = decls(
      '.needt-v3 .tdc-chip.is-empty[data-tdc-trigger="project"] .tdc-chip-text::before'
    );
    expect(rule.content).toBe("none");
  });

  it("drops motion for people who ask", () => {
    expect(SRC).toMatch(/prefers-reduced-motion: reduce/);
  });
});
