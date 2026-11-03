#!/usr/bin/env node
// Generates the sound effects and voice lines described in an audio spec through the ElevenLabs REST API.
// No dependencies (Node 22 fetch). The key comes from ELEVENLABS_API_KEY and is never printed.
//
//   set -a; . /Users/lol/Needt/.env.local; set +a
//   node marketing/videos/tools/elevenlabs.mjs marketing/videos/H1/v3/audio-spec.json <outDir> [sfx|voice|all]
//
// The designed voice is cached in <outDir>/voice.json, so re-running only regenerates the lines.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.elevenlabs.io";
const KEY = process.env.ELEVENLABS_API_KEY;
const [specPath, outDir, only = "all"] = process.argv.slice(2);
if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set");
if (!specPath || !outDir) throw new Error("usage: elevenlabs.mjs <spec.json> <outDir> [sfx|voice|all]");

const spec = JSON.parse(await readFile(specPath, "utf8"));
await mkdir(outDir, { recursive: true });
const exists = (p) => access(p).then(() => true, () => false);

async function call(path, body, { query = "", json = false } = {}) {
  const res = await fetch(`${API}${path}${query}`, {
    method: body ? "POST" : "GET",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return json ? res.json() : Buffer.from(await res.arrayBuffer());
}

const format = `?output_format=${spec.outputFormat ?? "mp3_44100_128"}`;

if (only === "all" || only === "sfx") {
  for (const cue of spec.sfx) {
    for (let v = 0; v < (spec.variants ?? 3); v++) {
      const file = join(outDir, `${cue.id}_${"abc"[v]}.mp3`);
      if (await exists(file)) continue;
      const audio = await call("/v1/sound-generation", {
        text: cue.prompt,
        duration_seconds: cue.seconds,
        prompt_influence: cue.influence ?? 0.5,
        model_id: spec.sfxModel ?? "eleven_text_to_sound_v2",
      }, { query: format });
      await writeFile(file, audio);
      console.log("sfx", file);
    }
  }
}

if (only === "all" || only === "voice") {
  const cache = join(outDir, "voice.json");
  let voice;
  if (await exists(cache)) {
    voice = JSON.parse(await readFile(cache, "utf8"));
  } else {
    const design = await call("/v1/text-to-voice/design", {
      voice_description: spec.voice.description,
      text: spec.voice.previewText,
      model_id: "eleven_ttv_v3",
      guidance_scale: spec.voice.guidanceScale ?? 4,
    }, { json: true });
    for (const [i, p] of design.previews.entries()) {
      await writeFile(join(outDir, `voice_preview_${i + 1}.mp3`), Buffer.from(p.audio_base_64, "base64"));
    }
    const pick = design.previews[(spec.voice.pick ?? 1) - 1];
    const created = await call("/v1/text-to-voice", {
      voice_name: spec.voice.name,
      voice_description: spec.voice.description,
      generated_voice_id: pick.generated_voice_id,
    }, { json: true });
    voice = { voice_id: created.voice_id, name: spec.voice.name, preview: spec.voice.pick ?? 1 };
    await writeFile(cache, JSON.stringify(voice, null, 2));
    console.log("voice", voice.name, "from preview", voice.preview);
  }
  for (const line of spec.lines) {
    const file = join(outDir, `${line.id}.mp3`);
    if (await exists(file)) continue;
    const audio = await call(`/v1/text-to-speech/${voice.voice_id}`, {
      text: line.text,
      model_id: spec.ttsModel ?? "eleven_v4",
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }, { query: format });
    await writeFile(file, audio);
    console.log("line", file);
  }
}

const sub = await call("/v1/user/subscription", null, { json: true });
console.log(`credits used ${sub.character_count} of ${sub.character_limit} (${sub.tier})`);
