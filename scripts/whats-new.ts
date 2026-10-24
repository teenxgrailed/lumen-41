/**
 * Compiles `changelog.d/*.md` and the newest released sections of
 * `CHANGELOG.md` into `public/whats-new.json`, the feed behind What's new.
 * Runs before `next build` and `next dev`. A released entry is dated by its
 * `## [x.y.z] — YYYY-MM-DD` heading.
 *
 * A fragment's date is the day its file was first committed. Where git has
 * no full history (the Docker build has no `.git`; CI checks out one commit),
 * the dates come from `.whats-new-git-log`, the same `git log` output the
 * release workflow writes into the build context. Without either, entries are
 * undated and listed after the dated ones.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  compileWhatsNew,
  datesFromGitLog,
  parseChangelog,
} from "../src/lib/whats-new/compile";

const root = path.join(__dirname, "..");
const dir = path.join(root, "changelog.d");
const changelog = path.join(root, "CHANGELOG.md");
const out = path.join(root, "public", "whats-new.json");
const logFile = path.join(root, ".whats-new-git-log");

const GIT_LOG_ARGS = [
  "log",
  "--diff-filter=A",
  "--format=%x00%cI",
  "--name-only",
  "--",
  "changelog.d",
];

function gitLog(): string | null {
  try {
    const shallow = execFileSync(
      "git",
      ["rev-parse", "--is-shallow-repository"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (shallow === "true") return null;
    return execFileSync("git", GIT_LOG_ARGS, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function main() {
  const names = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".md"))
    : [];
  const log =
    gitLog() ?? (existsSync(logFile) ? readFileSync(logFile, "utf8") : "");
  const dates = datesFromGitLog(log);
  // A collected fragment is gone from changelog.d, but its add commit is
  // still in the log: use it to order the release's entries newest first.
  const releases = (
    existsSync(changelog) ? parseChangelog(readFileSync(changelog, "utf8")) : []
  ).map((r) => ({
    ...r,
    parts: r.parts.map((p) => ({
      ...p,
      at: p.name ? (dates.get(p.name)?.at ?? null) : null,
    })),
  }));
  const feed = compileWhatsNew(
    names.map((name) => ({
      name,
      text: readFileSync(path.join(dir, name), "utf8"),
      date: dates.get(name)?.date ?? null,
      at: dates.get(name)?.at ?? null,
    })),
    { releases }
  );
  writeFileSync(out, `${JSON.stringify(feed, null, 2)}\n`);
  const entries = feed.groups.reduce((n, g) => n + g.entries.length, 0);
  const undated = feed.groups.find((g) => g.date === null)?.entries.length ?? 0;
  console.log(
    `What's new: ${entries} entries in ${feed.groups.length} groups` +
      (undated ? ` (${undated} undated)` : "") +
      ` -> ${path.relative(root, out)}`
  );
}

main();
