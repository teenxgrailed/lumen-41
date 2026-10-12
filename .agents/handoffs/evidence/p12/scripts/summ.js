const f = process.argv[2];
const r = require(f);
const short = (s) => s.replace(/ < div\.[^<]*/g, "").slice(0, 70);
for (const k of Object.keys(r)) {
  if (k === "__errors") { console.log("ERRORS", r[k]); continue; }
  const x = r[k];
  if (x.error) { console.log(k, "ERROR", x.error); continue; }
  const inf = x.animations.filter((a) => a.iterations === "Infinity").length;
  const names = [...new Set(x.animations.map((a) => a.name + "@" + short(a.target)))];
  console.log(`${k.padEnd(18)} anims=${x.animations.length} inf=${inf} bdEff=${x.effectiveBackdrops}/${x.allBackdrops} wc=${x.willChange.length}`, names.slice(0, 6).join(" | "));
}
