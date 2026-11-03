# H1 v3 — sound and voice (2026-11-03)

v2 has no audio stream at all. v3 = same picture + SFX bed + a voice. No music (X rule: nothing unlicensed).

## Sources (checked 2026-11-03)

| What | Where | Licence | Cost |
|---|---|---|---|
| Generated SFX | ElevenLabs Sound Effects, elevenlabs.io/sound-effects | commercial on any paid plan, rights survive cancellation; Free = personal use only | Starter $6/mo, first month $1 until 2026-11-08; 200 credits per generation (150/mo) |
| Voice | ElevenLabs Voice Design (v3), same plan | same | 1 credit per character |
| Stock SFX (fallback, free) | pixabay.com/sound-effects | Pixabay Content Licence: commercial OK, no attribution, no standalone resale | $0 |

Free ElevenLabs output must not be posted (personal use only).

## Voice

Voice Design prompt:

> Native English. Androgynous, ageless. Studio quality. Persona: calm machine hivemind. Emotion: dry, confident, quietly amused. Low close-mic timbre with a faint metallic shimmer, slow deliberate pacing, small pauses between words, as if several voices speak almost in unison.

Post: duplicate the take, pitch the copy one octave down at -12 dB under the original, light chorus, cut everything below 80 Hz.

Lines (beat → line). No partner names spoken; the on-screen labels stay as they are.

| Beat | Line |
|---|---|
| chaos | "Tabs. Mail. Code. Calls." (fast, flat) |
| funnel | "Feed it all in." |
| brain forms | "One brain." |
| cards come out | "Your agents pick it up." |
| approval tap | "You just say yes." |
| end card | "Needt." |

## SFX cue sheet (ElevenLabs prompts, 3 variants each, pick one)

| # | Beat | Prompt | Length |
|---|---|---|---|
| 1 | chaos | dense digital swarm: rapid notification pings, keyboard clicks, tiny glitch chirps, layered and chaotic, dry, over a low uneasy drone | 3 s |
| 2 | funnel | deep vacuum suction riser accelerating into a single point, airy whoosh, ends abruptly | 2 s |
| 3 | brain forms | low sub-bass impact with a crystalline glass shimmer tail | 1.5 s |
| 4 | card slides out (×4, pitch +1 semitone each) | soft UI card slide whoosh ending in a subtle tick | 0.4 s |
| 5 | checkmarks (×3, rising) | minimal glassy UI confirm chime, very short, satisfying | 0.3 s |
| 6 | approval tap | fingertip tap on glass, then a warm success tone with a sparkle | 1 s |
| 7 | end card | reverse swell into a deep cinematic logo hit, then silence | 2 s |

## Timeline (v2 from src/scene.js, branch marketing/h1-v2 c0fa2e8, 30 fps, 14.5 s)

| t, s | Visual | Sound | Voice |
|---|---|---|---|
| 0.0–3.4 | fade-in, chaos | #1 swarm fades in 0.0–0.6, cut at 3.4 | 0.8 "Tabs. Mail. Code. Calls. Who's on all of it?" |
| 3.4–6.0 | funnel | #2 riser 4.0 → ends 6.0 | 3.8 "Feed it all in." |
| 6.6 | "n" fully formed | #3 impact on 6.6 | 6.8 "One brain." |
| 7.20 / 7.85 / 8.50 / 9.15 | cards out | #4 slide on each, +1 semitone | 7.3 "Your agents pick it up." |
| 7.65 / 8.30 / 8.95 / 9.50 | agent chips "claimed" | soft tick (#4 tail, -6 dB) | — |
| 9.00 / 9.55 / 10.35 | done ✓ | #5 chime, rising | — |
| 9.85 | card 4 amber | low tension tone under | 9.85 "You just say yes." (ends before 10.5) |
| 10.50 / 10.60 | tap / Approved ✓ | #6 tap on 10.50, success tone on 10.60 | — |
| 10.95–11.55 | scene out | near-silence 0.3 s | — |
| 11.3–12.1 | end card mark | #7 reverse swell into hit on 12.1 | — |
| 13.25 | use.needt.app | — | 13.25 "Needt." |

End card now reads "Needt Agents — free to start" (Free = 2 agents).
Render: Needt Cloud (has source and ffmpeg), not the Mac.

Mix: voice leads; SFX duck 3 dB under each line; impacts land on the frame where the motion resolves (risers build into it); a 0.3 s near-silence before #7; master -14 LUFS, true peak -1 dBTP.
About 21 generations + about 2,000 voice credits: fits inside Starter.
