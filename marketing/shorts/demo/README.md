# Needt demo shorts — demo-01 (14.11.2026)

Three 9:16 product shorts recorded from the real app, not mock-ups. No character track, no voice, no third-party clips.

| File | Length | What happens on screen |
|---|---|---|
| `needt-short-01-spread.mp4` | 14.0 s | Today shows 9 overdue tasks → tap **Spread** → "9 tasks moved to days with room" → Today is clear → Upcoming: Monday 4, Tuesday 5 |
| `needt-short-02-type-it.mp4` | 13.0 s | Composer: "Call mom today at 8pm for 20 min" → Today / At 8pm chips light up → Add → "Next up 20:00 · 20 min" |
| `needt-short-03-agents-map.mp4` | 15.4 s | Agents Map (recorded 05.11 on `marketing/agents-map`): 5 agents, 15 hub items, two waiting on the owner |

All: 1080×1920, 30 fps, H.264 + AAC 48 kHz, -14 LUFS integrated, true peak ≤ -1.1 dBFS, end card with the app icon and `use.needt.app`.
Drive copies: Needt Shorts / demo-01.

## How they were made

- App: `main` at a222264c, `next dev` locally against a throwaway Postgres + Redis, seeded by `tools/seed.ts` (user "Alex", projects Launch and Personal, 9 overdue tasks, 15 min to 3 h). No real account, no personal data.
- Recording: `tools/record.ts <user.json> <out> spread|upcoming|compose` drives a phone viewport (414×736 CSS px at DPR 2.61 → 1080×1920) through the CDP screencast, keeps every frame's capture time in `frames.txt`, and draws a soft ring where a tap lands. Spread and the composer are the app's own actions; `tools/schedule.ts` runs the scheduler the way the worker does (used to prepare the composer scene).
- Edit: `tools/build.py <spec.json> <out.mp4>` (specs in `specs/`): frames at their real timing → 30 fps, app at 80 % with rounded corners under a caption band, captions word by word with key words in yellow, Kenney SFX (CC0) on taps, music bed, loudness to -14 LUFS. Captions use a static Inter 800 instance cut from `public/fonts/inter/Inter-V.ttf`.
- Checks: contact sheets of every scene and every final, loudness/peak per file, no silence gap over 0.5 s, tap SFX peak above the bed.

## Credits (put in every post)

Music: "Happy Beats / Business Moves Vol. 10" by Sascha Ende, ende.app, CC BY 4.0. SFX: Kenney, CC0.

## Post texts and links

UTM: `utm_source=x|reels|tiktok|shorts`, `utm_medium=social`, `utm_campaign=shorts`, `utm_content=spread|type-it|agents-map`.

1. **spread** — I ignored 9 tasks for a week. One tap on Spread and Needt found a day with room for each one. Today: clear.
   `https://use.needt.app/?utm_source=x&utm_medium=social&utm_campaign=shorts&utm_content=spread`
2. **type-it** — Type a task the way you'd say it. "Call mom today at 8pm for 20 min" → day, time and length, no pickers.
   `https://use.needt.app/?utm_source=x&utm_medium=social&utm_campaign=shorts&utm_content=type-it`
3. **agents-map** — 5 AI agents, 15 jobs, one map. Who's working, who's done, who's waiting on you.
   `https://use.needt.app/?utm_source=x&utm_medium=social&utm_campaign=shorts&utm_content=agents-map`

For Reels/TikTok/Shorts swap `utm_source` to `reels`, `tiktok`, `shorts`.

Not checked: playback on a phone, how IG crops the cover frame.
