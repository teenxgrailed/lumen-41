/**
 * The design-system guard (docs/handoff/design-system.md, 2026-11-23).
 *
 * Outside src/styles/ds/ and src/components/needt3/ds/ no stylesheet may add:
 *   - a box-shadow with a colour literal (elevation is the shared raised
 *     material, tokens.css),
 *   - a new *-btn, *-chip, *-switch or *-seg class (the shared components are
 *     the buttons, chips, switches and segmented controls),
 *   - a 14px font size (the chrome is 13 and 12),
 *   - a grey that is not on the ladder (one ink at six alphas, six fills).
 *
 * Today's violations are counted per file in ds-guard-allowlist.json. The
 * allowlist is exact: fix one and the test asks you to lower the count (run
 * `DS_GUARD_UPDATE=1 npx jest ds-guard`, it refuses to write a bigger one), so
 * a fixed violation can never be spent on a new one. It cannot grow: its totals
 * are capped below, and compared with main's when git can see main.
 *
 * Exempt, because they are not the product's own chrome: the mock OS UI
 * (settings-mac, widget-preview), the paywall and upgrade sheet, the onboarding
 * sky (ob3, sky-tokens, auth-sky) and the agents night screens.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  type Findings,
  isLiteralShadow,
  offLadderGreys,
  scanCss,
} from "./ds-guard-scan";

const ROOT = path.resolve(__dirname, "../../..");
const ALLOWLIST = path.join(__dirname, "ds-guard-allowlist.json");
const ALLOWLIST_REL = "src/styles/__tests__/ds-guard-allowlist.json";

/** Where the system itself lives: the only CSS that may carry a shadow, a grey or a size. */
const OWN = ["src/styles/ds/", "src/components/needt3/ds/"];

/** Not the product's own chrome. Each pattern must still match a file (checked below). */
const EXEMPT: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "mock Mac settings", pattern: /\/settings-mac\.css$/ },
  { name: "widget preview", pattern: /\/widget-preview\.css$/ },
  { name: "paywall", pattern: /\/paywall\.css$/ },
  { name: "upgrade sheet", pattern: /\/keep-pro\.css$/ },
  { name: "onboarding sky", pattern: /^src\/styles\/onboarding\// },
  { name: "auth sky", pattern: /\/auth-sky\.css$/ },
  { name: "agents night", pattern: /\/agents-night\.css$/ },
];

/**
 * The most the allowlist may ever hold, per kind, as generated on 2026-11-23.
 * Lower these when the allowlist shrinks; raising one is a decision a reviewer
 * has to see in this file, not a side effect of "make the test pass".
 */
const CEILING = { shadow: 64, font14: 116, grey: 732, classes: 183 };

type Counts = Record<string, number>;
interface Allowlist {
  shadow: Counts;
  font14: Counts;
  grey: Counts;
  classes: Record<string, string[]>;
}

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), {
    withFileTypes: true,
  })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) cssFiles(rel, out);
    else if (entry.name.endsWith(".css")) out.push(rel);
  }
  return out;
}

const isOwn = (file: string) => OWN.some((dir) => file.startsWith(dir));
const isExempt = (file: string) => EXEMPT.some((e) => e.pattern.test(file));

const ALL = cssFiles("src").sort();
const SCANNED = ALL.filter((file) => !isOwn(file) && !isExempt(file));

function scanAll(): Allowlist {
  const out: Allowlist = { shadow: {}, font14: {}, grey: {}, classes: {} };
  for (const file of SCANNED) {
    const f: Findings = scanCss(
      readFileSync(path.join(ROOT, file), "utf8"),
      file
    );
    if (f.shadow) out.shadow[file] = f.shadow;
    if (f.font14) out.font14[file] = f.font14;
    if (f.grey) out.grey[file] = f.grey;
    if (f.classes.length) out.classes[file] = f.classes;
  }
  return out;
}

const total = (counts: Counts) =>
  Object.values(counts).reduce((sum, n) => sum + n, 0);
const totalClasses = (classes: Record<string, string[]>) =>
  Object.values(classes).reduce((sum, names) => sum + names.length, 0);
const totals = (a: Allowlist) => ({
  shadow: total(a.shadow),
  font14: total(a.font14),
  grey: total(a.grey),
  classes: totalClasses(a.classes),
});

function read(): Allowlist | null {
  return existsSync(ALLOWLIST)
    ? (JSON.parse(readFileSync(ALLOWLIST, "utf8")) as Allowlist)
    : null;
}

/** What main holds, when this checkout can see it (CI checks out shallow: then null). */
function onMain(): Allowlist | null {
  try {
    const text = execFileSync("git", ["show", `origin/main:${ALLOWLIST_REL}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(text) as Allowlist;
  } catch {
    return null;
  }
}

const actual = scanAll();
const allowed = read();

if (process.env.DS_GUARD_UPDATE === "1") {
  const next = totals(actual);
  if (allowed) {
    const before = totals(allowed);
    for (const kind of Object.keys(next) as Array<keyof typeof next>)
      if (next[kind] > before[kind])
        throw new Error(
          `ds-guard: refusing to write a bigger allowlist (${kind}: ${before[kind]} -> ${next[kind]}). Fix the new violations instead.`
        );
  }
  writeFileSync(
    ALLOWLIST,
    JSON.stringify(
      {
        _about:
          "Today's design-system violations, per file (src/styles/__tests__/ds-guard.test.ts). Exact: lower it when you fix one (DS_GUARD_UPDATE=1 npx jest ds-guard); it can never grow.",
        ...actual,
      },
      null,
      2
    ) + "\n"
  );
  console.log("ds-guard: allowlist written", next);
}

describe("the detectors", () => {
  it("a box-shadow is literal when anything outside var() is a colour", () => {
    expect(isLiteralShadow("0 1px 2px rgba(0, 0, 0, 0.1)")).toBe(true);
    expect(isLiteralShadow("inset 0 0 0 1px #fff, var(--x)")).toBe(true);
    expect(isLiteralShadow("0 0 0 1px var(--x, rgba(0,0,0,.2))")).toBe(false);
    expect(isLiteralShadow("var(--v3-raised-disc-shadow)")).toBe(false);
    expect(
      isLiteralShadow("inset 0 0 0 1.5px var(--v2p-ink), var(--a), var(--b)")
    ).toBe(false);
    expect(isLiteralShadow("none")).toBe(false);
  });

  it("a grey is on the ladder or it is a mistake", () => {
    // ladder alphas, pure white and black, and every hue are fine
    expect(offLadderGreys("rgba(26, 28, 30, 0.55)")).toEqual([]);
    expect(offLadderGreys("rgba(249 249 249 / 8%)")).toEqual([]);
    expect(offLadderGreys("#fff")).toEqual([]);
    expect(offLadderGreys("#000")).toEqual([]);
    expect(offLadderGreys("rgba(46, 109, 233, 0.4)")).toEqual([]);
    expect(offLadderGreys("rgba(var(--foreground-rgb), 0.08)")).toEqual([]);
    // an alpha off the ladder, an opaque grey, a hex grey
    expect(offLadderGreys("rgba(18, 18, 20, 0.52)")).toHaveLength(1);
    expect(offLadderGreys("rgba(0, 0, 0, 0.5)")).toHaveLength(1);
    expect(offLadderGreys("#f6f6f3")).toHaveLength(1);
    expect(offLadderGreys("rgb(30 30 30)")).toHaveLength(1);
    expect(offLadderGreys("rgba(var(--foreground-rgb), 0.5)")).toHaveLength(1);
    expect(offLadderGreys("#ffffff80")).toHaveLength(1);
  });

  it("counts the four things in a stylesheet", () => {
    const f = scanCss(`
      .a-btn, .b .c-chip:hover { color: rgba(0,0,0,.5); box-shadow: 0 1px #000; }
      .ok { font-size: 13px; box-shadow: var(--x); color: var(--text-primary); }
      .d-seg-btn, .e-switch-knob { font: 500 14px/18px sans-serif; }
      @media (hover: hover) { .f-switch { font-size: 14px; } }
    `);
    expect(f.classes).toEqual(["a-btn", "c-chip", "d-seg-btn", "f-switch"]);
    expect(f.shadow).toBe(1);
    expect(f.font14).toBe(2);
    expect(f.grey).toBe(1);
  });
});

describe("the design-system guard", () => {
  it("finds the stylesheets it is meant to guard", () => {
    expect(SCANNED.length).toBeGreaterThan(100);
    expect(SCANNED.some((f) => isOwn(f))).toBe(false);
  });

  it("every exemption still names a file (a typo would exempt nothing, and hide it)", () => {
    for (const { name, pattern } of EXEMPT)
      expect(
        ALL.some((f) => pattern.test(f)) ? name : `${name} (no file)`
      ).toBe(name);
  });

  it("has an allowlist, generated once", () => {
    expect(allowed).not.toBeNull();
  });

  it("adds no new box-shadow literal, component class, 14px size or off-ladder grey", () => {
    const fresh: string[] = [];
    const a = allowed!;
    for (const kind of ["shadow", "font14", "grey"] as const)
      for (const [file, n] of Object.entries(actual[kind]))
        if (n > (a[kind][file] ?? 0))
          fresh.push(`${file}: ${n - (a[kind][file] ?? 0)} new ${kind}`);
    for (const [file, names] of Object.entries(actual.classes))
      for (const name of names)
        if (!(a.classes[file] ?? []).includes(name))
          fresh.push(`${file}: new .${name}`);
    // The fix is never "add it to the allowlist": use a ds component, a ds
    // token, a ladder grey. See docs/handoff/design-system.md.
    expect(fresh).toEqual([]);
  });

  it("keeps the allowlist exact: a fixed violation lowers it", () => {
    const stale: string[] = [];
    const a = allowed!;
    for (const kind of ["shadow", "font14", "grey"] as const)
      for (const [file, n] of Object.entries(a[kind]))
        if ((actual[kind][file] ?? 0) < n)
          stale.push(`${file}: ${kind} ${n} -> ${actual[kind][file] ?? 0}`);
    for (const [file, names] of Object.entries(a.classes))
      for (const name of names)
        if (!(actual.classes[file] ?? []).includes(name))
          stale.push(`${file}: .${name} is gone`);
    // Run: DS_GUARD_UPDATE=1 npx jest ds-guard   (it will not write a bigger one)
    expect(stale).toEqual([]);
  });

  it("never lets the allowlist grow", () => {
    const now = totals(allowed!);
    for (const kind of Object.keys(CEILING) as Array<keyof typeof CEILING>)
      expect({ kind, n: now[kind] <= CEILING[kind] }).toEqual({
        kind,
        n: true,
      });
    const main = onMain();
    if (main) {
      const before = totals(main);
      for (const kind of Object.keys(now) as Array<keyof typeof now>)
        expect({ kind, n: now[kind] <= before[kind] }).toEqual({
          kind,
          n: true,
        });
    }
  });

  it("holds the system's own files to the system", () => {
    const own = ALL.filter(isOwn);
    expect(own).toEqual(
      expect.arrayContaining([
        "src/styles/ds/tokens.css",
        "src/styles/ds/components.css",
      ])
    );
    for (const file of own) {
      const f = scanCss(readFileSync(path.join(ROOT, file), "utf8"), file);
      expect({ file, font14: f.font14 }).toEqual({ file, font14: 0 });
      for (const name of f.classes)
        expect({ file, name, ds: name.startsWith("ds-") }).toEqual({
          file,
          name,
          ds: true,
        });
    }
    // the components draw every shadow and every grey from the tokens
    const components = scanCss(
      readFileSync(path.join(ROOT, "src/styles/ds/components.css"), "utf8")
    );
    expect(components.shadow).toBe(0);
    expect(components.grey).toBe(0);
  });
});
