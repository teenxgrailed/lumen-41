// Supply-chain gate: `npm audit --omit=dev --audit-level=high` with a
// documented allowlist. Fails on any high or critical advisory in the
// production tree that is not in .github/npm-audit-allowlist.json, and on any
// allowlist entry past its reviewBy date, so an accepted risk is looked at
// again instead of living forever. Allowlisted advisories that no longer
// appear are reported so the entry can be deleted.
//
// Run: node scripts/check-npm-audit.mjs [--audit-file audit.json]
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const ALLOWLIST = ".github/npm-audit-allowlist.json";
const BLOCKING = new Set(["high", "critical"]);

function auditJson() {
  const fileFlag = process.argv.indexOf("--audit-file");
  if (fileFlag !== -1) return readFileSync(process.argv[fileFlag + 1], "utf8");
  try {
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // npm audit exits non-zero whenever it finds anything; the JSON is still
    // on stdout.
    if (error && typeof error.stdout === "string" && error.stdout.trim()) {
      return error.stdout;
    }
    throw error;
  }
}

function advisoryId(via) {
  const fromUrl = typeof via.url === "string" ? via.url.split("/").pop() : "";
  return fromUrl || String(via.source);
}

const report = JSON.parse(auditJson());
if (report.error) {
  console.error(`npm audit failed: ${JSON.stringify(report.error)}`);
  process.exit(1);
}

const found = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
    const id = advisoryId(via);
    if (!found.has(id)) {
      found.set(id, {
        id,
        package: via.name,
        severity: via.severity,
        title: via.title,
        url: via.url,
      });
    }
  }
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST, "utf8")).advisories ?? [];
const allowed = new Map(allowlist.map((entry) => [entry.id, entry]));
const today = new Date().toISOString().slice(0, 10);

const unlisted = [...found.values()].filter((a) => !allowed.has(a.id));
const overdue = allowlist.filter(
  (entry) => found.has(entry.id) && entry.reviewBy < today
);
const stale = allowlist.filter((entry) => !found.has(entry.id));

const lines = [
  `npm audit --omit=dev: ${found.size} high/critical advisories, ${found.size - unlisted.length} allowlisted.`,
];
for (const a of unlisted) {
  lines.push(
    `NOT ALLOWED  ${a.severity} ${a.package} ${a.id} ${a.title} ${a.url}`
  );
}
for (const entry of overdue) {
  lines.push(
    `REVIEW DUE   ${entry.package} ${entry.id} (reviewBy ${entry.reviewBy}): ${entry.reason}`
  );
}
for (const entry of stale) {
  lines.push(
    `FIXED        ${entry.package} ${entry.id}: delete it from ${ALLOWLIST}`
  );
}

console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ["### npm audit", "", "```", ...lines, "```", ""].join("\n")
  );
}
for (const entry of stale) {
  console.log(
    `::warning file=${ALLOWLIST}::${entry.id} (${entry.package}) is no longer reported; remove it.`
  );
}

if (unlisted.length || overdue.length) {
  console.error(
    `\nAdd a fix, or an entry in ${ALLOWLIST} with a reason and a reviewBy date.`
  );
  process.exit(1);
}
