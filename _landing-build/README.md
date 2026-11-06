# Landing build tools (from the 29.10–03.11.26 design session)

These scripts generated the current "Needt - Landing" folder. They were written for a cloud
workspace where the landing lived at /home/claude/lp/dev; change the paths before running.
Keep this folder OUTSIDE "Needt - Landing" so it is never deployed.

- wire.py — header "More" deck, footer links, pricing rows, sitemap, llms.txt, home band
  (#more-needt), cache-bust; appends add-styles.css to styles.css. Idempotent.
- build.py — /plugin/, /budget/, /students/ on the security/index.html shell (sub.css).
- updates.py — home #updates list. feat.py — home #features grid + moves the hero phone into .stage.
- devices.py — home #devices. download.py — /download/ from download.orig.html.
- Order for the home page: wire.py → updates.py → feat.py (devices.py once).
- checks/ — Playwright checks: perf.js (CDP scroll profile), brk.js (320/375 overflow +
  worst-case text), mob.js (header taps on 5 pages), rm.js (reduced motion), stu.js (errors +
  scrollWidth on 5 pages); comp.py/cap.js/lib.js built the hero phone video from the prototype.

## v42 (03.11.26)
- Paths: every script reads `paths.py` (`NEEDT_SITE`, default `../Needt - Landing`). No more /home/claude paths.
- Base = the deployed branch: `git archive origin/landing landing-site`, then `NEEDT_SITE=<that copy> sh build_v42.sh`:
  merge_v41.py (v41.css) → facts_v42.py → updates.py → feat_v42.py → sections_v42.py → style_v42.py (v42.css + v42.js between ⟦v42⟧ markers, brace + glued-selector check) → bust_v42.py. All idempotent.
- Do not re-run wire.py / build.py on the branch base: they hold older copy (students live, "no card", seven skills). build.py writes /students/ only with NEEDT_STUDENTS_LIVE=1.
- Assets: upd_assets.py (assets/upd/ from captures), feat_v42.py makes the "-0" before-frames itself, sections use assets/op/.
- Captures: checks/upcap.js, dark.js (prototype at :8799 = "Needt - Design : App, Landing" root), extcap.js (Needt-extension at :8833). lib.js needs NEEDT_DEMO_DATA → Needt - Social/templates/demo-data.js.
- New checks: checks/shots.js (every home section at 1440 + 390), checks/sec.js (one section). baseline/ = v41 shots + perf before v42.

## Run order, v42–v53 (as of 06.11.26)

Only this README is in git. The scripts live in the local `_landing-build/` folder next to the main checkout.
They are not in the repo: `baseline/` alone is 25 MB.

Every script reads `NEEDT_SITE` through `paths.py`, edits the site copy in place, and is idempotent.
Base the work on the deployed branch, never on an old local copy:

```sh
git worktree add <wt> origin/landing          # or a sparse checkout of landing-site/
export NEEDT_SITE=<wt>/landing-site
```

Run the scripts in this order. When re-running, start from the first script that changed and run everything after it:

| # | Script | What it writes | Note |
|---|---|---|---|
| 1 | `sh build_v42.sh` | home pipeline v41→v42 | only on a base older than v42; the current branch already has it |
| 2 | `nav_v43.py`, `support_v43.py`, `perf_v43.py` | header safe area, footer Support, lazy images and font cut | any order |
| 3 | `seo_v43.py` | sharing tags, sitemap dates | **writes `og.png` back**, so run step 13 after it |
| 4 | `bust_v43.py` | `?v=` cache-bust on styles.css/app.js | re-run after any CSS/JS change |
| 5 | `agents_v44.py`, then `agents_v44b.py` | /agents/ links, Free vs Pro limits | |
| 6 | `relay_v45.py` (+ `relay_v45.css/js`) | home fold "Relay" | |
| 7 | `seo_v47.py` | brand title, JSON-LD, footer brand link | **writes `og.png` back**, so run step 13 after it |
| 8 | `fazier_v48.py`, `badges_v50.py` | directory badges | CSP hosts are in `docker/landing/security-headers.conf` |
| 9 | `alt_v51.py` | alt text | |
| 10 | `map_v52.py` | Agents Map film section on the home | before step 11 |
| 11 | `ab_v46.py` | rebuilds `index-b.html` from `index.html` | **after every change to index.html** |
| 12 | `sitemap_v49.py` | sitemap lastmod from git | after committing the page changes |
| 13 | `og_v53.py` | `og-home.png` on `/`, `index-b.html` and `/agents/` | last of the edits; it must come after both `seo_*` scripts |
| 14 | `indexnow.py` | IndexNow ping | **after the deploy**, never before |

Ship the result as a PR into branch `landing` (needt.app builds from it).

### Screenshots for the landing and promo images

Use `marketing/capture.js` (in git), not the older one-off `checks/cap*.js` and `dark.js`.
It serves the prototype itself, takes no server on :8799 or :8812, and sets the dark theme for you:

```sh
NODE_PATH=/Users/lol/Needt/.claude/nm-base/node_modules node marketing/capture.js <out> [scene ...]
```

`--list` prints the scenes.
