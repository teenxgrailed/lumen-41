/**
 * The sound under a Focus session, made in the browser.
 *
 * Brown and pink noise are generated once into a short buffer and looped
 * (Web Audio, nothing downloaded). The lo-fi tracks are fetched and decoded
 * only the first time one is picked, then looped from memory so the seam is
 * gapless. One sound plays at a time; a change fades the old one out and the
 * new one in. Nothing here touches React or runs per frame: the nodes play
 * on the audio thread.
 *
 * Browsers keep an AudioContext suspended until the page has seen a gesture.
 * A session started with a tap is fine; a session found running after a
 * reload waits for the first tap or key and then starts.
 */
import { type Sound, trackUrl } from "./focus";

const FADE_IN = 1.4;
const FADE_OUT = 0.7;
/** Noise is dense, tracks are not: each kind has its own ceiling. */
const LEVEL = { noise: 0.22, track: 0.6 } as const;
const NOISE_SECONDS = 9;
const NOISE_SEAM_SECONDS = 1;

interface Playing {
  id: Sound;
  gain: GainNode;
  source: AudioBufferSourceNode;
}

let ctx: AudioContext | null = null;
let playing: Playing | null = null;
/** The latest request: a slow download that lost the race plays nothing. */
let ticket = 0;
const buffers = new Map<string, AudioBuffer>();
let unlockArmed = false;

const audioCtor = (): typeof AudioContext | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

/** False where the browser has no Web Audio (the sound row is then hidden). */
export const canPlaySound = () => audioCtor() !== null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const C = audioCtor();
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Starts the context on the next tap or key if it was still suspended. */
function armUnlock() {
  if (unlockArmed || typeof document === "undefined") return;
  unlockArmed = true;
  const go = () => {
    document.removeEventListener("pointerdown", go, true);
    document.removeEventListener("keydown", go, true);
    unlockArmed = false;
    void ctx?.resume().catch(() => undefined);
  };
  document.addEventListener("pointerdown", go, true);
  document.addEventListener("keydown", go, true);
}

/** Equal-power crossfade of the tail into the head, so the loop has no seam. */
function loopable(raw: Float32Array, length: number, seam: number) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = raw[i];
  for (let i = 0; i < seam; i++) {
    const t = i / seam;
    out[i] = raw[i] * Math.sqrt(t) + raw[length + i] * Math.sqrt(1 - t);
  }
  return out;
}

function noiseBuffer(c: AudioContext, kind: "brown" | "pink"): AudioBuffer {
  const rate = c.sampleRate;
  const length = Math.floor(NOISE_SECONDS * rate);
  const seam = Math.floor(NOISE_SEAM_SECONDS * rate);
  const buf = c.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const raw = new Float32Array(length + seam);
    if (kind === "brown") {
      let b = 0;
      for (let i = 0; i < raw.length; i++) {
        b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        raw[i] = b * 3.5;
      }
    } else {
      // Paul Kellet's economy filter over white noise.
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < raw.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    buf.copyToChannel(loopable(raw, length, seam), ch);
  }
  return buf;
}

async function trackBuffer(c: AudioContext, url: string): Promise<AudioBuffer> {
  const hit = buffers.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`focus sound ${res.status}`);
  const data = await res.arrayBuffer();
  const buf = await new Promise<AudioBuffer>((resolve, reject) => {
    c.decodeAudioData(data, resolve, reject);
  });
  buffers.set(url, buf);
  return buf;
}

function fadeOutAndStop(p: Playing, c: AudioContext) {
  const t = c.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + FADE_OUT);
  try {
    p.source.stop(t + FADE_OUT + 0.05);
  } catch {
    /* already stopped */
  }
  p.source.onended = () => {
    p.source.disconnect();
    p.gain.disconnect();
  };
}

/** Silence, with a short fade. Safe to call when nothing plays. */
export function stopSound() {
  ticket++;
  if (playing && ctx) fadeOutAndStop(playing, ctx);
  playing = null;
}

/**
 * Plays `id` under the session (or silence for "off"). Resolves true when the
 * sound is running or waiting for a first tap, false when it cannot play
 * (no Web Audio, the file did not load).
 */
export async function playSound(id: Sound): Promise<boolean> {
  if (id === "off") {
    stopSound();
    return true;
  }
  if (playing?.id === id) return true;
  const c = context();
  if (!c) return false;
  const mine = ++ticket;
  try {
    const url = trackUrl(id);
    let buffer = url ? await trackBuffer(c, url) : buffers.get(id);
    if (!buffer) {
      buffer = noiseBuffer(c, id === "pink" ? "pink" : "brown");
      buffers.set(id, buffer);
    }
    if (mine !== ticket) return true;
    if (playing) fadeOutAndStop(playing, c);
    const gain = c.createGain();
    gain.gain.value = 0;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(c.destination);
    source.start();
    const level = url ? LEVEL.track : LEVEL.noise;
    gain.gain.linearRampToValueAtTime(level, c.currentTime + FADE_IN);
    playing = { id, gain, source };
    if (c.state === "suspended") {
      void c.resume().catch(() => undefined);
      armUnlock();
    }
    return true;
  } catch {
    return false;
  }
}
