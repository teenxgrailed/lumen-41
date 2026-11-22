#!/usr/bin/env node
// Honest <lastmod> for landing-site/sitemap.xml.
//
//   node scripts/seo/sitemap-lastmod.mjs [--dir landing-site] [--base https://needt.app] [--write]
//   node scripts/seo/sitemap-lastmod.mjs --check [--since <git-ref>]
//
// A page's lastmod is the commit date (%cI) of the last commit that changed the
// visible text inside its <main>. Site-wide edits that only touch the header,
// footer, <head>, scripts or a cache bump (most commits on `landing` touch all
// ~100 pages at once) and button labels do not count, so they no longer push every URL to "today".
// Needs full git history (not a shallow clone). Without --write it prints the
// URLs whose date would change and exits 0.
//
// --check is the CI gate: exit 1 when a lastmod differs from what --write would
// set. With --since <ref> (the PR's base branch) pages whose text last changed in
// a commit already on <ref> are skipped: a squash merge gives that change a new
// commit date, and the next PR must not fail over a page it did not touch.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

function run(cwd, a) {
  return execFileSync("git", a, { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
}

// Newest commit that changed the visible text of `file`: { sha, date }.
export function lastContentChange(file, top, git = (...a) => run(top, a)) {
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
    if (older !== text) return { sha, date }; // `sha` changed the visible text
    [sha, date, text] = [olderSha, olderDate, older];
  }
  return { sha, date }; // unchanged since the file was created
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const dir = resolve(opt("--dir", "landing-site"));
  const base = opt("--base", "https://needt.app");
  const write = args.includes("--write");
  const check = args.includes("--check");
  const since = opt("--since", null);

  const top = run(dir, ["rev-parse", "--show-toplevel"]).trim();
  // Paths below are relative to the repository root, so git runs there.
  const git = (...a) => run(top, a);
  if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
    console.error("shallow clone: run `git fetch --unshallow` first (CI: fetch-depth: 0)");
    process.exit(2);
  }
  const onBase = (sha) => {
    if (!since) return false;
    try {
      git("merge-base", "--is-ancestor", sha, since);
      return true;
    } catch {
      return false;
    }
  };

  const smPath = join(dir, "sitemap.xml");
  let xml = readFileSync(smPath, "utf8");
  let changed = 0;
  const stale = [];
  xml = xml.replace(
    /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]*)<\/lastmod>)?\s*<\/url>/g,
    (whole, loc, old) => {
      const path = loc.slice(base.length);
      const hit = lastContentChange(join(dir, path, "index.html"), top, git);
      if (!hit) {
        console.error(`no git history for ${loc}`);
        if (check) stale.push(`${loc}  no git history`);
        return whole;
      }
      if (hit.date !== old) {
        if (check) {
          if (!onBase(hit.sha)) stale.push(`${loc}  sitemap says ${old ?? "-"}, text last changed ${hit.date} (${hit.sha.slice(0, 9)})`);
        } else {
          changed++;
          if (!write) console.log(`${loc}  ${old ?? "-"} -> ${hit.date}`);
        }
      }
      return `<url><loc>${loc}</loc><lastmod>${hit.date}</lastmod></url>`;
    }
  );
  if (check) {
    if (stale.length) {
      console.error(
        `${stale.length} lastmod value(s) out of date; run: node scripts/seo/sitemap-lastmod.mjs --write\n` +
          stale.map((p) => "  " + p).join("\n")
      );
      process.exit(1);
    }
    console.log("sitemap lastmod values match the last text change of every page");
    return;
  }
  if (write) writeFileSync(smPath, xml);
  console.log(`${changed} lastmod value(s) ${write ? "updated" : "would change"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
