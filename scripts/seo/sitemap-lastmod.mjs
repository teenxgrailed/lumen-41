#!/usr/bin/env node
// Honest <lastmod> for landing-site/sitemap.xml.
//
//   node scripts/seo/sitemap-lastmod.mjs [--dir landing-site] [--base https://needt.app] [--write]
//
// A page's lastmod is the commit date (%cI) of the last commit that changed the
// visible text inside its <main>. Site-wide edits that only touch the header,
// footer, <head>, scripts or a cache bump (most commits on `landing` touch all
// ~100 pages at once) and button labels do not count, so they no longer push every URL to "today".
// Needs full git history (not a shallow clone). Without --write it prints the
// URLs whose date would change and exits 0.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const dir = resolve(opt("--dir", "landing-site"));
const base = opt("--base", "https://needt.app");
const write = args.includes("--write");

const run = (cwd, a) =>
  execFileSync("git", a, { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
const top = run(dir, ["rev-parse", "--show-toplevel"]).trim();
// Paths below are relative to the repository root, so git runs there.
const git = (...a) => run(top, a);
if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
  console.error("shallow clone: run `git fetch --unshallow` first");
  process.exit(2);
}

export function mainText(html) {
  const m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return (
    (m ? m[1] : html)
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      // Button labels ("Try it free" -> "Log in") are UI, not the page's content.
      .replace(
        /<(a|button)\b[^>]*\bclass=["'][^"']*\bbtn\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function lastContentChange(file) {
  const path = relative(top, file);
  const log = git("log", "--format=%H %cI", "--", path)
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!log.length) return null;
  const textAt = (sha) => {
    try {
      return mainText(git("show", `${sha}:${path}`));
    } catch {
      return null; // file did not exist at that commit
    }
  };
  let [sha, date] = log[0].split(" ");
  let text = textAt(sha);
  for (const line of log.slice(1)) {
    const [olderSha, olderDate] = line.split(" ");
    const older = textAt(olderSha);
    if (older !== text) return date; // `sha` changed the visible text
    [sha, date, text] = [olderSha, olderDate, older];
  }
  return date; // unchanged since the file was created
}

const smPath = join(dir, "sitemap.xml");
let xml = readFileSync(smPath, "utf8");
let changed = 0;
xml = xml.replace(
  /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]*)<\/lastmod>)?\s*<\/url>/g,
  (whole, loc, old) => {
    const path = loc.slice(base.length);
    const date = lastContentChange(join(dir, path, "index.html"));
    if (!date) {
      console.error(`no git history for ${loc}`);
      return whole;
    }
    if (date !== old) {
      changed++;
      if (!write) console.log(`${loc}  ${old ?? "-"} -> ${date}`);
    }
    return `<url><loc>${loc}</loc><lastmod>${date}</lastmod></url>`;
  }
);
if (write) writeFileSync(smPath, xml);
console.log(
  `${changed} lastmod value(s) ${write ? "updated" : "would change"}`
);
