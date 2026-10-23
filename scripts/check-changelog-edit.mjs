#!/usr/bin/env node
// Fails a pull request that edits CHANGELOG.md directly. Changelog entries go
// in changelog.d/<slug>.md (see changelog.d/README.md); every PR appending to
// the same place in CHANGELOG.md conflicts with every other PR.
//
// CHANGELOG.md may still change when the PR is a release or a fragment
// compile:
//   - the PR title or a commit subject starts with "release:" or "release(";
//   - every changed line is a "## [...]" release heading;
//   - every added line comes from a changelog.d fragment the PR deletes and
//     only headings are removed (what `npm run changelog:collect` produces).
//
// CI:    node scripts/check-changelog-edit.mjs --pr-files files.ndjson --subjects subjects.txt
//        (files.ndjson: one {filename,status,patch} per line from the PR files
//        API; subjects.txt: one commit subject per line; PR_TITLE in env)
// Local: node scripts/check-changelog-edit.mjs [--base origin/main]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CHANGELOG = "CHANGELOG.md";
const FRAGMENT = /^changelog\.d\/(?!readme\.md$)[^/]+\.md$/i;
const HEADING = /^## \[/;
const RELEASE = /^release[:(]/i;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function patchLines(patch, sign) {
  return (patch ?? "")
    .split("\n")
    .filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3)))
    .map((l) => l.slice(1).trimEnd())
    .filter((l) => l.trim() !== "");
}

function fromApi(filesPath, subjectsPath) {
  const files = readFileSync(filesPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const subjects = subjectsPath
    ? readFileSync(subjectsPath, "utf8").split("\n").filter(Boolean)
    : [];
  const changelog = files.find((f) => f.filename === CHANGELOG);
  return {
    touched: Boolean(changelog),
    patch: changelog?.patch,
    deletedFragmentLines: files
      .filter((f) => f.status === "removed" && FRAGMENT.test(f.filename))
      .flatMap((f) => patchLines(f.patch, "-")),
    subjects: [process.env.PR_TITLE ?? "", ...subjects],
  };
}

function fromGit(base) {
  const git = (...a) => execFileSync("git", a, { encoding: "utf8" });
  const range = `${base}...HEAD`;
  const deleted = git("diff", "--name-only", "--diff-filter=D", range)
    .split("\n")
    .filter((f) => FRAGMENT.test(f));
  const names = git("diff", "--name-only", range).split("\n");
  return {
    touched: names.includes(CHANGELOG),
    patch: git("diff", "-U0", range, "--", CHANGELOG),
    deletedFragmentLines: deleted.flatMap((f) =>
      patchLines(git("diff", "-U0", range, "--", f), "-")
    ),
    subjects: git("log", "--format=%s", `${base}..HEAD`).split("\n"),
  };
}

const prFiles = arg("--pr-files");
const pr = prFiles
  ? fromApi(prFiles, arg("--subjects"))
  : fromGit(arg("--base") ?? "origin/main");

function verdict() {
  if (!pr.touched) return { ok: true, why: "CHANGELOG.md is not changed." };
  if (pr.subjects.some((s) => RELEASE.test(s.trim())))
    return {
      ok: true,
      why: "release PR (title or commit starts with release:).",
    };
  if (pr.patch === undefined || pr.patch === null)
    return { ok: false, why: "the CHANGELOG.md diff is too large to inspect." };
  const fromFragments = new Set(pr.deletedFragmentLines);
  const stray = [
    ...patchLines(pr.patch, "+").filter(
      (l) => !HEADING.test(l) && !fromFragments.has(l)
    ),
    ...patchLines(pr.patch, "-").filter((l) => !HEADING.test(l)),
  ];
  if (stray.length === 0)
    return { ok: true, why: "only release headings or collected fragments." };
  return {
    ok: false,
    why: `${stray.length} changed line(s) are neither a release heading nor a collected fragment (first: "${stray[0].trim()}").`,
  };
}

const { ok, why } = verdict();
if (ok) {
  console.log(`changelog guard: ok, ${why}`);
} else {
  console.error(
    `::error file=${CHANGELOG}::Do not edit CHANGELOG.md in a PR: ${why} ` +
      "Add changelog.d/<slug>.md instead (see changelog.d/README.md); " +
      "release PRs start their title with 'release:'."
  );
  process.exit(1);
}
