import fs from "node:fs";
import path from "node:path";

import { sampleEmails } from "../catalog";
import { lifecycleSamples } from "../lifecycle-catalog";

/**
 * Renders every email to HTML and text files so they can be opened in a
 * browser and pasted into an inbox tester.
 *
 *   EMAIL_PREVIEW_DIR=/some/scratch/folder npx jest render-previews
 *
 * Without EMAIL_PREVIEW_DIR the writing test is skipped. The link test always
 * runs: every link a template can print must point at a route that exists.
 */
const previewDir = process.env.EMAIL_PREVIEW_DIR;

function allEmails(): Array<[string, { html: string; text: string }]> {
  return [
    ...Object.entries(sampleEmails()),
    ...lifecycleSamples().map(
      (sample): [string, { html: string; text: string }] => [
        `lifecycle-${sample.key}`,
        sample.email,
      ]
    ),
  ];
}

const APP_DIR = path.join(process.cwd(), "src", "app");
const PAGE_FILES = ["page.tsx", "page.ts", "route.ts", "route.tsx"];

/** True when `urlPath` maps to a page or route handler under src/app. */
function routeExists(urlPath: string): boolean {
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) {
      return PAGE_FILES.some((f) => fs.existsSync(path.join(dir, f)));
    }
    const [head, ...tail] = rest;
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .some((e) => {
        const sub = path.join(dir, e.name);
        if (/^\(.+\)$/.test(e.name)) return walk(sub, rest); // route group
        if (/^\[{1,2}\.\.\..+\]{1,2}$/.test(e.name)) return true; // catch-all
        if (/^\[.+\]$/.test(e.name)) return walk(sub, tail); // dynamic segment
        return e.name === head && walk(sub, tail);
      });
  };
  return walk(APP_DIR, urlPath.split("/").filter(Boolean));
}

describe("email previews", () => {
  (previewDir ? it : it.skip)("writes every email as .html and .txt", () => {
    const dir = previewDir as string;
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, mail] of allEmails()) {
      fs.writeFileSync(path.join(dir, `${name}.html`), mail.html);
      fs.writeFileSync(path.join(dir, `${name}.txt`), mail.text);
    }
    const items = allEmails()
      .map(([name]) => `<li><a href="${name}.html">${name}</a></li>`)
      .join("");
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<!doctype html><meta charset="utf-8"><title>Needt emails</title><ul>${items}</ul>`
    );
  });

  it("links only to https pages and routes that exist", () => {
    for (const [name, mail] of allEmails()) {
      const hrefs = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) =>
        m[1].replaceAll("&amp;", "&")
      );
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        const url = new URL(href);
        expect({ name, href, protocol: url.protocol }).toEqual({
          name,
          href,
          protocol: "https:",
        });
        expect({ name, href, exists: routeExists(url.pathname) }).toEqual({
          name,
          href,
          exists: true,
        });
      }
    }
  });
});
