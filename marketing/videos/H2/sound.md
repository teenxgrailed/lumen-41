# H2 "It plans the day" — sound and voice (2026-11-03)

Picture: branch marketing/h2-h3 3c138c9, 14.0 s, 30 fps, no audio. Timings from `src/scene.js` (`T`).
Same rules as H1 (`marketing/videos/H1/sound.md`): no music, paid ElevenLabs only, mp3_44100_128 on Starter.
Voice: the same "Needt Hivemind" as H1. Copy `H1/v3/audio/voice.json` into `H2/audio/` before running, so no new voice is designed.

## Timeline

| t, s | Visual | Sound | Voice |
|---|---|---|---|
| 0.3–1.0 | week grid fades in | low room tone, soft | — |
| 0.9 → 1.7 | 9 overdue cards drop onto Today, one every 0.1 s | #1 card thud on each, pitch randomised ±2 st | — |
| 1.9 | pinned task appears | #2 pin click | — |
| 2.1–4.6 | the pile trembles | #3 rattling tension, rising | 2.3 "Nine things. One day." |
| 2.9 | "n" mark appears | — | — |
| 3.6 / 4.1 / 4.6 | mark pulses | #4 sonar pulse on each | 3.7 "Let it plan." |
| 4.6 → 7.06 | task i leaves at 4.6 + 0.22·i, lands 0.7 s later | #5 short whoosh on each leave; quiet tick on each land | — |
| 7.3 | free time lights up | #6 relief bloom | 7.4 "All nine placed. Now watch today." |
| 7.9–9.9 | "now" line runs down Today, ticks tasks it passes | #7 glassy tick on each tick (sync to `passed()`); the pin stays put, no sound on it | — |
| 10.1–10.6 | calendar fades out | near-silence | — |
| 10.7 / 10.9 / 11.35 | end mark, "It plans the day." / "You just show up." | #8 reverse swell into hit on 10.9 | 11.35 "You just show up." |
| 12.1 | use.needt.app | — | 12.2 "Needt." |

## SFX prompts (3 variants each) — see `H2/audio-spec.json`

| # | Prompt | Length |
|---|---|---|
| 1 | soft cardboard card dropping onto a desk, short dull thud | 0.5 s |
| 2 | small metallic pin pressed into a board, crisp click | 0.5 s |
| 3 | nervous trembling rattle of a stack of cards over a low tension drone that slowly rises | 2.6 s |
| 4 | deep warm digital sonar pulse, single ping | 0.6 s |
| 5 | quick short airy whoosh, fast pass left to right | 0.5 s |
| 6 | soft airy bloom, warm pad swell of relief, clean | 1.6 s |
| 7 | minimal glassy UI tick, very short | 0.5 s |
| 8 | reverse swell building into a deep cinematic logo hit, short dark tail | 2.2 s |

Mix: voice leads, SFX duck 3 dB under each line; the 9 thuds and 9 whooshes must not pile into noise — keep each at -10 dB relative to #3/#6; -14 LUFS, true peak -1 dBTP.
