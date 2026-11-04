#!/usr/bin/env node
// Lays the generated SFX and voice lines onto a silent H-video and writes the finished mp4.
// Needs ffmpeg on PATH (Needt Cloud). No dependencies.
//
//   node marketing/videos/tools/mix.mjs marketing/videos/H2/mix.json [variant]
//
// mix.json lists one or more renders (video in, mp4 out) that share one sound layout.
// mix.json paths are relative to the mix.json file. variant (a|b|c, default a) picks the SFX take.
// Every SFX that starts while a line is playing is lowered a further 3 dB (the "duck").
import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [mixPath, variant = "a"] = process.argv.slice(2);
if (!mixPath) throw new Error("usage: mix.mjs <mix.json> [a|b|c]");
const base = dirname(resolve(mixPath));
const mix = JSON.parse(await readFile(mixPath, "utf8"));
const at = (p) => resolve(base, p);

const lines = mix.lines.map((l) => ({ ...l, file: at(`${mix.audioDir}/${l.id}.mp3`) }));
const sfx = mix.sfx.flatMap((s) =>
  s.at.map((t, i) => ({ ...s, t, step: i, file: at(`${mix.audioDir}/${s.id}_${variant}.mp3`) })),
);

// Line end times come from the files, so the duck follows the real takes.
const probe = (f) =>
  Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout);
for (const l of lines) l.end = l.at + probe(l.file);
const underLine = (t) => lines.some((l) => t >= l.at && t < l.end);

for (const f of [...new Set([...lines, ...sfx].map((x) => x.file))]) {
  await access(f).catch(() => {
    throw new Error(`missing ${f}: run tools/elevenlabs.mjs first`);
  });
}

for (const render of mix.renders) {
  const inputs = ["-i", at(render.video)];
  const chains = [];
  const labels = [];
  const add = (file, t, gainDb, extra = []) => {
    const n = inputs.length / 2;
    inputs.push("-i", file);
    const ms = Math.round(t * 1000);
    chains.push(`[${n}:a]${[...extra, `volume=${gainDb}dB`, `adelay=${ms}|${ms}`].join(",")}[s${n}]`);
    labels.push(`[s${n}]`);
  };

  for (const l of lines) add(l.file, l.at, l.gainDb ?? 0);
  for (const s of sfx) {
    const extra = [];
    const st = (s.pitchStep ?? 0) * s.step;
    if (st) extra.push(`asetrate=44100*${Math.pow(2, st / 12).toFixed(5)}`, "aresample=44100");
    if (s.fadeIn) extra.push(`afade=t=in:d=${s.fadeIn}`);
    if (s.cutAt) extra.push(`atrim=0:${(s.cutAt - s.t).toFixed(3)}`, "afade=t=out:st=" + Math.max(0, s.cutAt - s.t - 0.15).toFixed(3) + ":d=0.15");
    add(s.file, s.t, (s.gainDb ?? -6) - (underLine(s.t) ? 3 : 0), extra);
}

const graph = [
  ...chains,
  `${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad,atrim=0:${mix.duration},loudnorm=I=-14:TP=-1:LRA=11[out]`,
].join(";");

const out = at(render.out);
const r = spawnSync(
  "ffmpeg",
  ["-y", ...inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(mix.duration), out],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("wrote", out);
}
