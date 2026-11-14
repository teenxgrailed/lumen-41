// Turns perf/json/*.json into perf/summary.md (and the job summary).
// Usage: node tests/perf/summarize.mjs [perfDir]
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
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
// Task window open (tests/perf/task-modal.perf.spec.ts): perf/modal/*.json.
const modalDir = path.join(dir, "modal");
const modalRows = existsSync(modalDir)
  ? readdirSync(modalDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => JSON.parse(readFileSync(path.join(modalDir, f), "utf8")))
  : [];
const modalLines = modalRows.map((r) =>
  r.status !== "ok"
    ? `| ${r.project} | unreachable: ${r.reason} | | | | | | |`
    : `| ${r.project} (${r.browser}) | ${v(r.cold.visibleMs)} | ${v(r.warm.visibleMsMedian)} | ${v(r.warm.visibleMsMax)} | ${v(r.warm.maxGapMsMedian)} | ${v(r.warm.slowFramesMedian)} | ${v(r.warm.longTasksTotal)} / ${v(r.warm.longTaskMsTotal)} | ${v(r.warm.longFramesTotal)} |`
);
const modalMd = modalRows.length
  ? `\n## Task window open (40 Today rows, task with 4 steps)\n\nClick to first frame with the card on screen, ms. Warm = runs 2..8. Long frames = rAF gaps over 50 ms (WebKit has no longtask API).\n\n| project | cold ms | warm median ms | warm max ms | max frame gap ms | frames over 20 ms | long tasks / ms | long frames |\n|---|---|---|---|---|---|---|---|\n${modalLines.join("\n")}\n`
  : "";
const md =
  `# Needt perf baseline\n\nCPU throttle: 4x phone, 2x desktop (Chromium only). Frame times in ms from a rAF recorder; script/layout/style are CDP Performance.getMetrics deltas. n/a = not measurable on that engine or not reached.\n\n${head}\n${lines.join("\n")}\n` +
  (notes.length ? `\n## Not reached\n\n${notes.join("\n")}\n` : "") +
  modalMd;
writeFileSync(path.join(dir, "summary.md"), md);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
