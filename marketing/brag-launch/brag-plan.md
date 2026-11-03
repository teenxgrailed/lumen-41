# Needt launch video — brag plan (2026-11-03)

Made with `/brag` (latent-spaces/brag 0.5.0, MIT). On this model the skill hands off to its
`brag-slim` workflow, so the whole film was planned and built in this run.
Rendered with HyperFrames 0.9.8 (Apache-2.0). Two cuts: 16:9 1920×1080 and 9:16 1080×1920,
both 30 fps and 23.0 s, recomposed for each format rather than cropped.

## What it is

- **One sentence:** Needt keeps everything you are working on in one place, and your day plans itself.
- **For:** anyone running work and life from a calendar plus a task list.
- **What sets it apart:** you move one meeting and Needt reshuffles the rest. You press Keep.
- **Hook:** the reshuffle itself, live on the real calendar, within 3 s.
- **Real UI shown:** the landing's own product screens: Calendar before and after the reshuffle,
  Today on desktop, Today on iPhone, quick capture. The agents card is rebuilt from the landing's
  "Needs you → Approve" card. No dashboard filler.
- **Tone:** polished: calm, premium, restrained. Long holds, no jokes.
- **Share caption:** see `share-copy.txt`.

## Angle

A day that rearranges itself, shown rather than claimed. Open on the action (one meeting moves,
the rest follows, Keep), then name it in the landing's exact headline, then prove it with three
real screens, then the CTA.

## Look (from needt.app, measured 2026-11-03)

- Ground `#f7f5f3` going into the landing's lavender sky (`#d9d5f0` / `#e9e6f3`), with the
  landing's `hero-clouds.webp` drifting at the bottom.
- Ink `#0e1520`. Muted text uses that ink at 68 %.
- Display: **Exposure** 500, tracking −0.035 to −0.05 em, with italics for the second line,
  as in the landing H1. UI and body: **Figtree**.
- Product surfaces: the landing's light screenshots, in white windows with a soft lavender
  shadow. The only accent is the brand icon and the selection ring.

## Copy (checked against content-principles)

All lines are Needt's own claims from needt.app, shortened. No partner names, no founder name,
nothing invented.

| Beat | On screen |
|---|---|
| Hook | "Move one meeting." → "Needt reshuffles the rest." |
| Promise | "Everything you're working on, *in one place.*" / "…and your day plans itself." |
| Today | "One thing next." → "Start it, or mark it done." |
| Capture | "Type it like you'd say it." |
| Agents | "Work moves while you're away." → "*You approve what matters.*" |
| End | Needt icon, "Needt", "Try it free →", "needt.app", "Free plan + 14 days of Pro." |

How the principles were applied:
- The hook is an event, not a premise. The viewer sees a meeting move before any slogan.
- The question "what just happened?" is opened at 0–3 s and answered by the promise at 3 s.
- The next loop, "what else does it do?", opens before the first one closes: three proofs follow.
- Short lines: the average is 4.6 words.
- Every claim is from the live landing.

## Storyboard (30 fps; music Vol. 10 at ~110 BPM, a beat is 0.546 s)

| # | Time, s | Scene | Motion | Sound |
|---|---|---|---|---|
| 1 | 0.00–3.05 | Hook: the Calendar week (`cal-before`) in a window, camera pushing into Wednesday | The finger grabs the 16:00 "Client call" (0.55), drags it to 10:00 (0.67–1.37). On the drop the week becomes `cal-after`: three rings mark what moved (1.42–1.62). The toast "Wed call → 10:00. Products → 16:00, courier → 17:00 · Undo · Keep" rises at 1.75 and Keep is tapped at 2.46. The window blurs out at 2.78. | click 0.55, drop 1.35, click 2.46 |
| 2 | 3.05–6.30 | Promise | The H1 enters word by word (3.15, italic line 3.75), the sub at 4.55, and it blurs out at 6.05. | — |
| 3 | 6.30–10.40 | Today, desktop (`today-light`) | The window rises from a 14° tilt (6.32) and the camera pushes from the full app into the Next up card (6.9–9.5). Caption swap at 7.75/7.95. | — |
| 4 | 10.40–14.20 | Capture | The iPhone with Today rises (10.40), and the capture sheet "Call the print shop tomorrow 14:00" lands beside it (10.75). | — |
| 5 | 14.20–18.05 | Agents | The card "Send the invoice batch · Needs you" lands (14.30). The finger taps Approve (16.93) → "Approved ✓". Caption swap at 15.90/16.08. | click 16.93 |
| 6 | 18.05–23.00 | End card | Icon (18.05), wordmark (18.55), "Try it free →" on the strong beat at 20.19, URL at 20.55, fine print at 20.85, held to the end. | soft impact 18.05, bong 20.19 |

Scene durations sum to 23.0 s. Cuts are on beats 3.01, 6.28, 10.38, 14.20 and 18.01
(±0.05 s), and the CTA lands on the strong cue at 20.19.

## Sources and licences

- **Product screens, sky, icon, iPhone frame and fonts (Exposure, Figtree):** Needt's own assets
  from needt.app (`/assets/…`), downloaded 2026-11-03. The names in the screenshots ("Alex",
  "Mia", "Sam", "Anna") are the landing's fictional demo data.
- **Music:** "Happy Beats / Business Moves Vol. 10" by Sascha Ende, ende.app, **CC BY 4.0**,
  bundled with brag. Anywhere the video is posted, credit "Music: Sascha Ende, ende.app (CC BY 4.0)".
- **SFX:** Kenney (CC0), bundled with brag.
- **GSAP 3.15.0:** standard no-charge licence, vendored locally so a render makes no network calls.

## Checks run

- `npx hyperframes check` passes on both cuts. Lint has 0 errors. Layout has 0 issues across
  9 samples. Contrast passes 22/22 text checks (WCAG AA).
  - Remaining warnings: `first_frame_empty`, which the baked poster solves, and a toast line that
    is on screen 1.1 s. The toast is UI texture; the caption above it carries the meaning.
  - The monolithic file triggers `nested_structure` and `timeline_track_too_dense` info. These
    are editability hints, not render issues.
- Snapshots were taken and looked at for every scene and the mid-transitions in both cuts. Fixes
  that came out of them:
  - an orphaned wrap in the 9:16 caption;
  - a crop that cut the Today card in 9:16;
  - a hard cloud edge, now a gradient mask;
  - two captions overlapping in scene 4.
- After the render, 6 frames per file were extracted and looked at, and the poster was baked as
  frame 0 (the promise frame at 5.6 s).
- Audio was normalised to −13.8 LUFS integrated, with a true peak of −1.2 dBFS.
- **Not checked:** the sound by ear (the levels are measured only), and playback on a phone.

## Rebuild

```bash
cd marketing/brag-launch/composition
node gen.mjs                               # writes landscape/ and vertical/index.html
for f in landscape vertical; do cp -al assets $f/assets; cp hyperframes.json $f/; done
(cd landscape && npx hyperframes@0.9.8 check && npx hyperframes@0.9.8 render --output ../out-16x9.mp4)
(cd vertical  && npx hyperframes@0.9.8 check && npx hyperframes@0.9.8 render --output ../out-9x16.mp4)
```

Then bake the poster as frame 0 and normalise the audio to −14 LUFS with ffmpeg, as described
above.
