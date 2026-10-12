const r = require(process.argv[2]);
const short = (s) => s.replace(/ blur.*$/, "").replace(/ < .*$/, "").slice(0, 60);
for (const [name, x] of Object.entries(r)) {
  for (const ph of ["go", "back"]) {
    const s = x[ph + "_samples"]; const p = x[ph + "_perf"];
    if (!s && !p) continue;
    const label = ph === "go" ? name : name + ":back";
    if (s) {
      const eff = s.map((t) => t.eff.length);
      const max = Math.max(...eff);
      const worst = s.find((t) => t.eff.length === max);
      const inf = Math.max(...s.map((t) => t.animInf));
      console.log(`${label.padEnd(18)} liveBlur@t ${s.map((t) => t.t + ":" + t.eff.length).join(" ")}  max=${max} anims(inf)=${Math.max(...s.map(t=>t.anims))}(${inf})`);
      if (process.env.V) console.log("     worst:", worst.eff.map(short).join(" ; "), "| moving:", worst.moving.join(","));
    }
    if (p) console.log(`${"".padEnd(18)} perf cpu${p.cpu}x frames=${p.frames} ms=${p.ms} fps=${p.fps} dt mean/p95/max=${p.dtMean}/${p.dtP95}/${p.dtMax} >20ms:${p.over20} >34ms:${p.over34} Layout=${p.events.Layout} Style=${p.events.UpdateLayoutTree} Paint=${p.events.Paint} PrePaint=${p.events.PrePaint} AF=${p.events.FireAnimationFrame} Commit=${p.events.Commit} Raster=${p.events.RasterTask}`);
  }
}
