#!/usr/bin/env node
// Moves every changelog.d/*.md fragment (except README.md) into CHANGELOG.md
// under "## [Unreleased]" and deletes the fragments.
import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "changelog.d");
const changelogPath = join(root, "CHANGELOG.md");

const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
      .sort()
  : [];

if (files.length === 0) {
  console.log("No changelog fragments to collect.");
  process.exit(0);
}

const entries = files
  .map((f) => readFileSync(join(dir, f), "utf8").trim())
  .filter(Boolean);

const changelog = readFileSync(changelogPath, "utf8");
const match = /^## \[Unreleased\][^\n]*\n/im.exec(changelog);
if (!match) {
  console.error("CHANGELOG.md has no '## [Unreleased]' heading.");
  process.exit(1);
}

const insertAt = match.index + match[0].length;
const rest = changelog.slice(insertAt);
const next =
  changelog.slice(0, insertAt) +
  "\n" +
  entries.join("\n") +
  "\n" +
  (rest.startsWith("\n") ? rest : "\n" + rest);

writeFileSync(changelogPath, next);
for (const f of files) unlinkSync(join(dir, f));
console.log(`Collected ${files.length} fragment(s) into CHANGELOG.md.`);
