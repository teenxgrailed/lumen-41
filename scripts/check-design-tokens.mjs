#!/usr/bin/env node
/**
 * Guards the one invariant that keeps the design port from blanking the app:
 * every rule in the vendored design-system stylesheets stays inside its scope —
 * `.needt-v2` for the September port, `.needt-v3` for the design v3 port.
 *
 * Nine token names are declared by both systems, and four of them are fatal if
 * they reach the document root — Tailwind reads --background, --foreground,
 * --border and --destructive as HSL triplets, the design system writes hex and
 * oklch into them, and `hsl(#fcfdfe)` is invalid CSS that paints transparent
 * with no console error, in one theme at a time.
 *
 * For v3 it also checks that every @keyframes is renamed `v3-…`: keyframes are
 * global, and 46 prototype names collide with the v2 layer's.
 *
 * Run by `npm run tokens:check`, and by lint-staged whenever a vendored
 * stylesheet is staged.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const V3_DIR = "src/styles/v3";
const v3Files = existsSync(join(ROOT, V3_DIR))
  ? readdirSync(join(ROOT, V3_DIR))
      .filter((f) => f.endsWith(".css"))
      .sort()
      .map((f) => `${V3_DIR}/${f}`)
  : [];

const GROUPS = [
  {
    scope: ".needt-v2",
    files: [
      "src/styles/needt-ds-tokens.css",
      "src/styles/needt-themes.css",
      "src/styles/needt-motion.css",
    ],
    // The document root may only be reached to style the root's own
    // view-transition pseudo-elements, and only while a scope is present.
    alsoAllowed: [],
    keyframePrefix: null,
    regenerate: "npm run tokens:sync",
  },
  {
    scope: ".needt-v3",
    files: v3Files,
    alsoAllowed: [":root:has(.needt-v3"],
    keyframePrefix: "v3-",
    regenerate: "npm run tokens:sync:v3",
  },
];

/** The names both systems declare. The first four are the fatal ones. */
const COLLIDING = [
  "--background", "--foreground", "--border", "--destructive",
  "--surface-canvas", "--surface-raised",
  "--text-primary", "--text-secondary", "--text-muted",
];

const problems = [];
let checked = 0;

for (const group of GROUPS) {
  for (const rel of group.files) {
    checked += 1;
    const file = join(ROOT, rel);
    let root;
    try {
      root = postcss.parse(readFileSync(file, "utf8"), { from: file });
    } catch (error) {
      problems.push(`${rel}: does not parse as CSS — ${error.message}`);
      continue;
    }

    // A keyframe step list ("0%, 100%") is not a selector. The sync script masks
    // @keyframes blocks so the selector pass cannot touch them; this catches the
    // regression if that masking ever breaks, because the failure is silent —
    // `.needt-v2 0%` is invalid, the browser drops the frame, and the animation
    // interpolates from whatever survived instead of erroring.
    root.walkAtRules(/keyframes$/, (atRule) => {
      if (group.keyframePrefix && !atRule.params.startsWith(group.keyframePrefix)) {
        problems.push(
          `${rel}:${atRule.source?.start?.line} — @keyframes ${atRule.params} is ` +
            `global and not renamed ${group.keyframePrefix}…; it can replace an ` +
            "old screen's animation",
        );
      }
      atRule.walkRules((step) => {
        for (const selector of step.selectors) {
          if (/^(from|to|\d+(\.\d+)?%)$/.test(selector.trim())) continue;
          problems.push(
            `${rel}:${step.source?.start?.line} — keyframe step "${selector}" in ` +
              `@keyframes ${atRule.params} is not a step; the selector pass scoped it`,
          );
        }
      });
    });

    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;

      // Browsers skip a selector they cannot parse; Next's production CSS
      // minimizer fails the whole build on it (2026-10-10, app.css capture
      // artifact). Parse every selector here so it fails at commit instead.
      try {
        selectorParser().processSync(rule.selector);
      } catch (error) {
        problems.push(
          `${rel}:${rule.source?.start?.line} — "${rule.selector.slice(0, 80)}" ` +
            `does not parse (${error.message}); fix the sync script, then ${group.regenerate}`,
        );
        return;
      }

      for (const selector of rule.selectors) {
        if (selector.startsWith(group.scope)) continue;
        if (group.alsoAllowed.some((prefix) => selector.startsWith(prefix))) continue;
        const declares = rule.nodes
          .filter((n) => n.type === "decl" && COLLIDING.includes(n.prop))
          .map((n) => n.prop);
        const why = declares.length
          ? `declares ${declares.join(", ")} outside the scope`
          : "is not scoped";
        problems.push(
          `${rel}:${rule.source?.start?.line} — "${selector}" ${why} ` +
            `(scope ${group.scope}; fix the sync script, then ${group.regenerate})`,
        );
      }
    });
  }
}

if (problems.length) {
  console.error("Vendored design tokens have escaped their scope:\n");
  for (const p of problems) console.error("  " + p);
  console.error(
    "\nEvery rule in these files must stay inside its scope. They are generated," +
    "\nso fix scripts/sync-design-tokens.mjs and re-run the sync.",
  );
  process.exit(1);
}

console.log(
  `All rules in ${checked} vendored stylesheets are scoped ` +
    `(${GROUPS.map((g) => `${g.scope}: ${g.files.length}`).join(", ")}).`,
);
