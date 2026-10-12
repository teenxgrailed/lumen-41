const r = require(process.argv[2]);
const lt = new Map(), f14 = new Map(); let hs = [];
const short = (s) => s.replace(/ < .*$/, "");
for (const [k, x] of Object.entries(r)) {
  if (!x.extra) continue;
  if (x.extra.hscroll) hs.push(k + " " + x.extra.sw + ">" + x.extra.iw);
  for (const t of x.extra.layoutTransitions) { const key = short(t.el) + " " + t.prop + " " + t.dur + "s"; (lt.get(key) || lt.set(key, new Set()).get(key)).add(k); }
  for (const t of x.extra.fonts14) { const key = short(t.el); (f14.get(key) || f14.set(key, new Set()).get(key)).add(k + ":" + t.text); }
}
console.log("HSCROLL", hs);
console.log("LAYOUT TRANSITIONS (computed)");
for (const [k, v] of lt) console.log("  ", k, "::", [...v].slice(0, 4).join(", "));
console.log("14px TEXT (computed)");
for (const [k, v] of f14) console.log("  ", k, "::", [...v].slice(0, 2).join(" | "));
