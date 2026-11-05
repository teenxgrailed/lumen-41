# Agents Map promo clips (05.11.2026)

Recorded from `main` at **bc9a540f** ("fix(habits): a new Quit habit's Since starts at now (#624)"), run locally against a test Postgres with a seeded demo workspace: 5 hub agents (Claude, Codex, Grok, Research bot, Mail triage), 15 hub items (working, done, needs you now, blocked, open) and 3 threads, one waiting on the owner's reply. No real account was used.

Agents → Map → Expand → **Presentation on**, then New layout, so the drawing-in plays from its first frame. Every clip is silent.

| File | Codec | Size | Duration | Bytes |
|---|---|---|---|---|
| `landing/map.webm` | vp9 | 1920×1080 | 12.0 s | 2.82 MB (2,958,079 B) |
| `landing/map.mp4` | h264 | 1920×1080 | 12.0 s | 2.77 MB (2,907,786 B) |
| `landing/map-poster.webp` | webp | 1920×1080 | still | 0.13 MB (138,524 B) |
| `map-16x9.mp4` | h264 | 1920×1080 | 25.0 s | 2.84 MB (2,974,892 B) |
| `map-16x9.webm` | vp9 | 1920×1080 | 25.0 s | 2.82 MB (2,954,101 B) |
| `map-9x16.mp4` | h264 | 1080×1920 | 13.0 s | 8.49 MB (8,898,216 B) |
| `map-poster.png` | png | 1920×1080 | still | 1.34 MB (1,401,984 B) |
| `map-poster.webp` | webp | 1920×1080 | still | 0.13 MB (136,232 B) |

- **`landing/`** is the landing loop: 12 s of the calm flow (13–25 s after the drawing-in starts). The last 1 s crossfades into the head, so the end meets the first frame. SSIM across the seam is 0.975; between two ordinary consecutive frames it is 0.958. The poster is the loop's first frame. For `landing-site/assets/agents-map/`.
- **`map-16x9.*`** is the X/social cut: 25 s, starting on the first frame of the drawing-in. `map-poster.*` is the settled map at 20 s.
- **`map-9x16.mp4`** is the Shorts cut: 13 s at 1080×1920, from the first frame of the drawing-in.
- The 16:9 files are two-pass encoded to stay under 3 MB at 1920×1080 (about 0.95 Mbit/s for 25 s and 1.9 Mbit/s for 12 s).

## How it was recorded

Playwright at 1920×1080 and 1080×1920 with deviceScaleFactor 2, reduced motion off. Frames were rendered one by one under a fake clock (`page.clock`, with `performance.now()` and rAF tied to it), so the result is an exact 30 fps with no dropped frames and no adaptive-quality step-down. They were downscaled with Lanczos. There is no cursor and no hover. The map's own control bar (Presentation, New layout, Exit) is hidden with CSS; the pills, labels and legend are as the app draws them. Scripts are in `tools/`: `seed.ts` (demo workspace), `capture.ts` (frames) and `encode.sh` (cuts).

Not checked: playback in Safari, and how the loop feels on the landing page itself.
