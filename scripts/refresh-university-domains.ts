/**
 * Re-downloads Hipo's university-domains-list and regenerates the committed
 * domain set the student discount reads
 * (src/lib/students/data/university-domains.json). The app never calls this
 * list at runtime; run this by hand and commit the result.
 *
 * Usage: npx tsx scripts/refresh-university-domains.ts
 *
 * The download is parsed as plain JSON and only the `domains` strings are
 * kept; nothing in it is executed. Public suffixes (edu, ac.uk) and free
 * mailbox domains are dropped by `deriveUniversityDomains`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { deriveUniversityDomains } from "../src/lib/students/university-domains";

const SOURCE_URL =
  "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
const OUT = join(
  __dirname,
  "..",
  "src",
  "lib",
  "students",
  "data",
  "university-domains.json"
);
/** The list had about 10,000 schools in 2026; far fewer means a bad download. */
const MIN_DOMAINS = 5_000;

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const text = await response.text();
  const domains = deriveUniversityDomains(JSON.parse(text));
  if (domains.length < MIN_DOMAINS) {
    throw new Error(
      `Only ${domains.length} domains; refusing to overwrite the snapshot.`
    );
  }
  const body = {
    source: SOURCE_URL,
    license: "MIT (Hipo university-domains-list)",
    fetchedAt: new Date().toISOString().slice(0, 10),
    count: domains.length,
    domains,
  };
  writeFileSync(OUT, `${JSON.stringify(body, null, 2)}\n`);
  process.stdout.write(`Wrote ${domains.length} domains to ${OUT}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
