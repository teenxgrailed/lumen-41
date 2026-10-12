const fs = require("fs");
const dir = process.argv[2] + "/";
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const groups = { B: [], A: [] };
for (const f of fs.readdirSync(dir)) { const m = f.match(/^motion-ab([AB])(\d+)-light\.json$/); if (m) groups[m[1]].push(JSON.parse(fs.readFileSync(dir + f))); }
const names = Object.keys(groups.B[0] || {});
const rows = [];
for (const n of names) for (const ph of ["go", "back"]) {
  const get = (g, k) => groups[g].map((r) => r[n] && r[n][ph + "_perf"] && r[n][ph + "_perf"][k]).filter((v) => v !== undefined && v !== null);
  if (!get("B", "fps").length) continue;
  const label = ph === "go" ? n : n + ":back";
  rows.push({ label, nB: get("B", "fps").length, nA: get("A", "fps").length, fpsB: med(get("B", "fps")), fpsA: med(get("A", "fps")), p95B: med(get("B", "dtP95")), p95A: med(get("A", "dtP95")), maxB: med(get("B", "dtMax")), maxA: med(get("A", "dtMax")), over34B: med(get("B", "over34")), over34A: med(get("A", "over34")), rasterB: med(get("B", "events").map((e) => e.RasterTask)), rasterA: med(get("A", "events").map((e) => e.RasterTask)), allB: get("B", "fps").join("/"), allA: get("A", "fps").join("/") });
}
console.log("scenario".padEnd(18), "n", " fps before→after (median)", " p95dt ms", " frames>34ms", " raster tasks", "  all runs fps B | A");
for (const r of rows) console.log(r.label.padEnd(18), r.nB + "/" + r.nA, String(r.fpsB).padStart(6), "→", String(r.fpsA).padEnd(6), "  ", r.p95B, "→", r.p95A, "  ", r.over34B, "→", r.over34A, "  ", r.rasterB, "→", r.rasterA, "  ", r.allB, "|", r.allA);
