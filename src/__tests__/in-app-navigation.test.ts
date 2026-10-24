/**
 * An installed home-screen app (iOS) stays standalone only while navigation
 * stays on its own origin: a document load to another host, to http://, or a
 * new window (`target="_blank"` / `window.open`) is handed to Safari's in-app
 * browser, and the app is left behind a bar with an X, a URL pill and a
 * toolbar. So the app's own screens move with the router or same-origin
 * relative URLs, never with an absolute URL to Needt itself.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = execFileSync("git", ["ls-files", "src"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !f.includes("__tests__") &&
      !/\.(test|spec)\.tsx?$/.test(f)
  );

const read = (f: string) => readFileSync(path.join(root, f), "utf8");

const OWN_HOST = String.raw`(?:www\.|use\.)?needt\.app`;

/** Offenders as `file:line text`. */
function scan(pattern: RegExp, allow: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (allow.some((a) => f.endsWith(a))) continue;
    read(f)
      .split("\n")
      .forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (pattern.test(line)) out.push(`${f}:${i + 1} ${line.trim()}`);
      });
  }
  return out;
}

describe("navigation inside the installed app", () => {
  it("the router never gets an absolute URL", () => {
    expect(
      scan(/router\.(push|replace|prefetch)\(\s*[`"']https?:\/\//)
    ).toEqual([]);
  });

  it("no document load or new window aims at Needt by absolute URL", () => {
    const sink = new RegExp(
      String.raw`(?:location\.(?:assign|replace)\(|location\.href\s*=|window\.open\()\s*[\x60"']https?://${OWN_HOST}`
    );
    expect(scan(sink)).toEqual([]);
  });

  it("no link to the app uses http:// or the other host", () => {
    // LegalDocument links the website (needt.app), deliberately an external
    // page.
    const link = new RegExp(
      String.raw`href=\{?[\x60"']http://|href=\{?[\x60"']https://${OWN_HOST}`
    );
    expect(scan(link, ["legal/LegalDocument.tsx"])).toEqual([]);
  });

  it("a same-origin path is not opened in a new window, except the legal pages", () => {
    // Terms, Privacy and Subprocessors sit outside the app shell and have no
    // way back; the in-app browser's Done button is that way back.
    const open = /window\.open\(\s*["']\/(?!terms|privacy|subprocessors)/;
    expect(scan(open)).toEqual([]);
  });

  it("the manifest keeps the app in one standalone scope", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest")) as Record<
      string,
      unknown
    >;
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override).toEqual(["standalone"]);
    expect(String(manifest.start_url).startsWith("/")).toBe(true);
    expect(String(manifest.id).startsWith("/")).toBe(true);
  });
});
