#!/usr/bin/env node
// Prepares a release commit; does not push or open the pull request.
//
//   npm run release:prepare -- <version> [date]
//   npm run release:prepare -- 1.0.0 2026-10-25
//
// From a clean checkout of fresh main it:
//   1. creates the branch release/<version>;
//   2. runs `npm run changelog:collect` (fragments into CHANGELOG.md, with
//      their `<!-- changelog.d/<name> -->` markers);
//   3. renames `## [Unreleased]` to `## [<version>] — <date>` and puts a fresh
//      empty `## [Unreleased]` above it;
//   4. bumps package.json, package-lock.json, the Mac app's MARKETING_VERSION
//      (apps/macos/project.yml) and the iOS app's (project.pbxproj); build
//      numbers stay CI-driven;
//   5. runs `npm run whats-new` and checks the feed shows the release (the
//      feed is gitignored and not committed);
//   6. writes docs/releases/<version>.md from the released bullets;
//   7. commits "release: <version>" and prints the push and `gh pr create`
//      commands.
// See docs/RELEASING.md for the launch-day runbook.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import release from "./lib/release.cjs";

const {
  cutRelease,
  hasRelease,
  isDay,
  isVersion,
  releaseNotes,
  setJsonVersion,
  setPbxprojMarketingVersion,
  setXcodegenMarketingVersion,
} = release;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(root, p);

/** Set once the release branch exists, so a failure says how to start over. */
let undo = "";

function fail(message) {
  console.error(`release:prepare: ${message}`);
  if (undo) console.error(`To start over: ${undo}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
  } catch {
    fail(`\`${cmd} ${args.join(" ")}\` failed.`);
  }
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const [version, date = today()] = process.argv.slice(2);
if (!version) fail("usage: npm run release:prepare -- <version> [YYYY-MM-DD]");
if (!isVersion(version)) fail(`version "${version}" is not X.Y.Z.`);
if (!isDay(date)) fail(`date "${date}" is not a YYYY-MM-DD day.`);

const branch = `release/${version}`;
if (git("status", "--porcelain")) {
  fail(
    "the working tree is not clean; commit or set aside your changes first."
  );
}
if (git("branch", "--list", branch)) fail(`branch ${branch} already exists.`);
if (git("tag", "--list", `v${version}`, `mac-v${version}`)) {
  fail(`a tag for ${version} already exists.`);
}
const head = git("rev-parse", "HEAD");
let main = "";
try {
  main = git("rev-parse", "--verify", "--quiet", "origin/main");
} catch {
  main = "";
}
if (head !== main) {
  console.warn(
    `release:prepare: warning: HEAD ${head.slice(0, 7)} is not origin/main` +
      `${main ? ` (${main.slice(0, 7)})` : ""}. Run \`git fetch origin\` and start from origin/main.`
  );
}

const changelogPath = join(root, "CHANGELOG.md");
if (hasRelease(readFileSync(changelogPath, "utf8"), version)) {
  fail(`CHANGELOG.md already has a [${version}] section.`);
}

run("git", ["switch", "-c", branch]);
undo = `git reset --hard && git switch --detach ${head} && git branch -D ${branch}`;
run("npm", ["run", "changelog:collect"]);

let section;
try {
  const cut = cutRelease(readFileSync(changelogPath, "utf8"), version, date);
  writeFileSync(changelogPath, cut.changelog);
  section = cut.section;
} catch (error) {
  fail(error.message);
}

const edits = [
  ["package.json", (t) => setJsonVersion(t, version)],
  ["package-lock.json", (t) => setJsonVersion(t, version, { lockfile: true })],
  ["apps/macos/project.yml", (t) => setXcodegenMarketingVersion(t, version)],
  [
    "apps/ios/ios/App/App.xcodeproj/project.pbxproj",
    (t) => setPbxprojMarketingVersion(t, version),
  ],
];
const changed = ["CHANGELOG.md", "changelog.d"];
for (const [file, edit] of edits) {
  const path = join(root, file);
  if (!existsSync(path)) {
    console.log(`(skipped ${file}: not in this checkout)`);
    continue;
  }
  try {
    writeFileSync(path, edit(readFileSync(path, "utf8")));
  } catch (error) {
    fail(`${file}: ${error.message}`);
  }
  changed.push(file);
}

run("npm", ["run", "whats-new"]);
const feed = JSON.parse(
  readFileSync(join(root, "public", "whats-new.json"), "utf8")
);
const released = (feed.groups ?? []).find((g) => g.date === date);
if (!released || released.entries.length === 0) {
  fail(
    `What's new has no entries dated ${date}; the [${version}] section was not read.`
  );
}
console.log(
  `What's new shows ${released.entries.length} entries dated ${date}.`
);

const notesPath = join(root, "docs", "releases", `${version}.md`);
mkdirSync(dirname(notesPath), { recursive: true });
writeFileSync(notesPath, releaseNotes({ version, date, section }));
changed.push(rel(notesPath));

run("git", ["add", "--all", "--", ...changed]);
run("git", ["commit", "-m", `release: ${version}`]);

console.log(`
Release ${version} is committed on ${branch} (${git("rev-parse", "--short", "HEAD")}).
Review it, then:

  git push -u origin ${branch}
  gh pr create --base main --head ${branch} --title "release: ${version}" --body-file ${rel(notesPath)}

After the merge deploys, follow docs/RELEASING.md (health check, mac-v${version} tag).`);
