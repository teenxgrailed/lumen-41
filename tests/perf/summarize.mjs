// Turns perf/json/*.json into perf/summary.md (and the job summary).
// Usage: node tests/perf/summarize.mjs [perfDir]
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "perf";
const jsonDir = path.join(dir, "json");
const files = existsSync(jsonDir)
  ? readdirSync(jsonDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
  : [];
const rows = files.map((f) =>
  JSON.parse(readFileSync(path.join(jsonDir, f), "utf8"))
);
const v = (x) => (x === null || x === undefined ? "n/a" : String(x));
const cell = (m) =>
  m
    ? [
        m.scriptMs,
        m.layoutMs,
        m.recalcStyleMs,
        m.layoutCount,
        m.frameP50Ms,
        m.frameP95Ms,
        m.longTasks,
        m.longTaskMs,
      ].map(v)
    : Array(8).fill("n/a");

const head =
  "| project | screen | phase | script ms | layout ms | style ms | layouts | frame p50 | frame p95 | long tasks | long ms |\n" +
  "|---|---|---|---|---|---|---|---|---|---|---|";
const lines = [];
const notes = [];
for (const r of rows) {
  if (r.status === "n/a") continue;
  if (r.status === "unreachable") {
    notes.push(`- ${r.project} / ${r.screen}: unreachable (${r.reason})`);
    continue;
  }
  lines.push(
    `| ${r.project} | ${r.screen} | idle 3s | ${cell(r.idle).join(" | ")} |`
  );
  lines.push(
    `| ${r.project} | ${r.screen} | interaction | ${cell(r.interaction).join(" | ")} |`
  );
  if (r.status !== "ok")
    notes.push(
      `- ${r.project} / ${r.screen}: interaction not driven (${r.reason})`
    );
}
const md =
  `# Needt perf baseline\n\nCPU throttle: 4x phone, 2x desktop (Chromium only). Frame times in ms from a rAF recorder; script/layout/style are CDP Performance.getMetrics deltas. n/a = not measurable on that engine or not reached.\n\n${head}\n${lines.join("\n")}\n` +
  (notes.length ? `\n## Not reached\n\n${notes.join("\n")}\n` : "");
writeFileSync(path.join(dir, "summary.md"), md);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
