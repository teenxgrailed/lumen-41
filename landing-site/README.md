# needt.app — marketing site (v21, 16.10.26)

Static, no build. Serve this folder as is (nginx, `try_files $uri $uri/ =404`).
No external requests at all (Figtree and Exposure are self-hosted in assets/). Everything is local; links and assets are relative,
so the folder also opens from disk (`site.js` rewrites folder links to `index.html` under `file://`).

## Pages
| Path | What |
|---|---|
| `/` | Home (`index.html` + `app.js`) |
| `/resources/` | Hub: ideas, MCP clients, API, blog, more |
| `/resources/mcp/` | Remote MCP setup for Claude, ChatGPT, Claude Code, Cursor, Codex, VS Code, Gemini CLI, Windsurf, Raycast, other |
| `/resources/api/` | Connector API reference + Shortcuts / n8n / Zapier / Make recipes |
| `/blog/` + 3 posts | `five-tabs-one-plan`, `plan-your-day-in-five-minutes`, `ai-assistant-calendar-mcp` |
| `/pricing/` | Free / Pro $7 or $59 / Lifetime $149, compare table, FAQ |
| `/compare/` + 6 | motion, sunsama, akiflow, reclaim, ticktick, todoist-notion (prices checked 11 Oct 2026) |
| `/changelog/` `/download/` `/help/` `/security/` `/privacy/` `/terms/` | — |
| `/404.html` | Absolute links (served from any path). nginx needs `error_page 404 /404.html;` |

## Shared parts
- Every inner page loads `styles.css` + `pages.css` + `site.js` (+ `vendor/sky.js`, `vendor/lenis.min.js`).
- Header, night footer and the floor wordmark are the same HTML on every page. Change one → change all
  (search for `<header class="nav"` / `<footer class="foot">`).
- Assets are cached 30 days `immutable` by nginx, so CSS/JS are linked with `?v=21` — bump it on every change.
- Sign-up target: `window.NEEDT_SIGNUP` (inline in each page) → `https://use.needt.app/auth/signin`.
- Analytics: commented Umami tag in each `<head>` (`__UMAMI_SITE_ID__`); enabling it needs `stats.needt.app`
  in `script-src` and `connect-src`.
- Inline `<script>` (NEEDT_SIGNUP, JSON-LD on posts) relies on `'unsafe-inline'` in the current CSP.

## Facts the copy depends on (re-check before changing)
- Prices/limits: `src/lib/creem/config.ts`, `src/lib/entitlements.ts`; trial `TRIAL_DURATION_DAYS = 14`; Lifetime capped at 300.
- MCP: `https://mcp.needt.app` (Streamable HTTP, OAuth or `Authorization: Bearer`), tools from `mcp/needt-mcp-server.mjs`.
- API: `https://use.needt.app/api/connect` — `/tasks`, `/schedule`, `/reschedule`, `/control`.
- Competitor prices: vendor pricing pages, 11 Oct 2026.

## Assets
- Sky: `vendor/sky.js` is the app's PxSky engine without React; colours in `vendor/sky-tokens.css`.
- Type: Exposure (licensed) for display, EXPO −5; Figtree for text.
- Logos in `assets/logos/`: Simple Icons (CC0) and old-site marks. Replace with official brand-kit assets before ads.
- Lenis is no longer loaded (v17, native scrolling); `vendor/lenis.min.js` is unused.

## v12 additions (11.10.26)
- Connect AI: one guide per client at `/resources/mcp/{claude,chatgpt,claude-code,cursor,codex,vscode,gemini,windsurf,raycast,other}/`, with real Needt screens (`assets/steps/`, captured from the frozen prototype's Connections screen, highlighted steps).
- Pricing is the app's paywall on the night sky (plan cards are selectable; Lifetime shows no seat counter — wire a real count before showing one).
- Phones: mobile tour of real phone screens (`assets/phone-*.webp`), sticky "Try it free", carousels, one-line index, wide tables as cards.
- Page transitions: CSS cross-document View Transitions in styles.css (no JS).
- Skies boot after load (requestIdleCallback); hosts show a CSS gradient first.
- Lighthouse mobile (local, simulated 4G): home 79 perf / 98 a11y; inner pages ~73–76 / 96. LCP is the first screenshot; the Exposure display font is 217 KB and blocks text for its first load (variable font, subsetting saves only ~3%).

## v13 decisions (11.10.26)
- MCP and the API are **Pro and Lifetime only** (included in the 14-day trial). Pricing, guides, help and compare tables say so. The app still needs the gate in `src/lib/entitlements.ts` (not done — app code).
- MCP address is **personal**: `https://mcp.needt.app/u/<name>`, copied from Connections → AI tools. Guides show `/u/your-name` as a placeholder.
- No Lifetime seat counter on the site.

## v14 (12.10.26)
- Clouds behind text (`data-px-calm`) now thin out as gently as they refill (~1 s): `easeCalm` in `vendor/sky.js` grows the thinning from tiny instead of an exponential ease; a resize keeps the thinned map instead of snapping. Same fix in the prototype's `scenes.jsx` (+ rebuilt `build/`).
- Night: halftone dots at night are softer (alpha .30/.15 instead of .45/.22, landing only); the screenshot pair no longer thins clouds around itself.
- Night performance: one parking rule for all skies (the night sky used to wake up mid-scroll), `--nt` set only on the veil and the dark screenshot (not the whole section), marquee pauses off screen and no longer forces a layout every frame. Desktop, 4× CPU throttle, scrolling the night zone: script time 2.8 s → 1.35 s, p95 frame 50 → 33 ms.

## v15 (12.10.26)
- Skies are **still** (`still: true` in `NeedtSky.mount`): no drift of their own, zero frames at rest; they move only under the pointer (and touch) and while clouds thin/refill behind scrolling text (12 fps). The skies on screen paint their first frame synchronously (`sync: true`), so the page opens with clouds, not a gradient that turns into clouds.
- Header: light menus (dark at night), icon on a pastel tile + name + one line. Product: Tour, Templates, Integrations, Download. Resources: Connect AI, Blog, All resources. Use cases, Changelog, Learn, Compare stay in the footer and on the Resources hub.
- Fixed: hovering from Product to Resources closed the Resources menu (Product's close timer closed every other menu).

## v16 (12.10.26)
- Header menus point to the strongest pages: Product → Tour, Plans itself, Integrations (home sections `#tour`, `#ai`, `#integrations`) and Templates; Resources → Ideas & guides (`resources/`), Connect AI (`resources/mcp/claude/`, real screens, links to every other client), Blog. Download, Use cases, Changelog, Learn, Compare stay in the footer.
- Checked all 93 pages (desktop + phone, 4× CPU throttle, scrolled top to bottom): no page above 5 frames over 50 ms; phone: none above 3.

## v17 (12.10.26)
- Native scrolling: Lenis is gone (it moved the page from the main thread, so any busy frame showed as a hitch on a fast flick). The header no longer uses `backdrop-filter`. Still skies drop the brush faster after the pointer leaves.
- Header: one card (max 860 px). Hovering Product/Resources grows it into a sheet (height eased 0.42 s, content slides in): four big cards + a column of links. Product → Integrations, Templates, Use cases, What's new + Product tour, Download, Security. Resources → Ideas & guides, Connect AI (`resources/mcp/`), Blog, Learn + Compare, API, Glossary, Help. Download is also a top-level link.
- Every one of the 93 pages is reachable from the home page through header and body links (checked by crawling, footer ignored).
- Calendar card: consistent white logo tiles (Google Calendar and iCloud from Simple Icons, CC0; Outlook drawn), task names changed.

## v18 (12.10.26)
- Every "Try it free" now opens **Pricing** (on Pricing itself it jumps to the gift). Pricing shows the gift on its own row — "A gift: 14 days of Pro, free" → sign-up — then "or buy now": the main button buys the selected plan.
- Buy links: `https://use.needt.app/settings?section=billing&checkout=pro-year|pro-month|lifetime`. Signed-out visitors are sent through sign-in by the middleware (callbackUrl keeps the query).
- **App work needed (Claude Code):** the app does not read these params yet. In the settings route, open the Billing section when `section=billing`, and when `checkout=` is present call `POST /api/billing/checkout` once with `{plan:"pro", interval:"year"|"month"}` or `{plan:"lifetime"}` and redirect to the returned checkout URL (same as the buttons in `BillingSettings.tsx`). Until then the link lands on Settings and the visitor clicks the plan there.
- Header: Craft proportions — card 58 % of the viewport (760–1120 px), 62 px tall, 16.5 px links without chevrons, round 46 px buttons, "Log in" as plain text.
- Pricing has three plans: Free (Start free → sign-up), Pro, Lifetime; Pro is preselected.

## v19 (12.10.26) — Pricing
- Top: a live demo instead of decorative cards — a client call moves from 14:00 to 10:00, two tasks shift around it, a "Keep" toast confirms (CSS transforms only; static final state under reduced motion).
- Plans: Free + Pro (Pro first on phones). Pro carries its three reasons: day plans itself, all calendars together, your AI sees your tasks. Yearly reads "$59 / year · equivalent to $4.92 a month · save 30%" (exact 29.8 %).
- Main button buys the selected plan; "or try Pro free for 14 days" and the gift row go to sign-up. Lifetime is one line under the button with its own buy link.
- Honest wording: no "every mailbox" (Pro has up to 3), "AI tools over MCP" instead of "Every AI tool".
- Keyboard: Enter/Space on Monthly/Yearly no longer captured by the plan card; plan cards show a focus ring.

## v20 (16.10.26)
- Phones: `img, video { height: auto }` — phone screenshots were squeezed (width/height attributes kept the 874 px height while max-width shrank the width).
- Mobile home hero: a 16 s real recording of the frozen prototype (Today → Every place sheet → Calendar, Tasks, Docs → Home), `assets/phone-tour.mp4` (H.264, 1.1 MB) + `.webm` (VP9, 1.0 MB), poster `phone-tour-poster.webp`. Loaded by JS only on phones, plays only on screen, poster only under reduced motion. Recorded via CDP screencast at 0.2× animation rate and re-timed to real speed.
- iOS Safari: no `theme-color`; the hidden sticky CTA is `visibility: hidden`, so Safari no longer tints its bars dark.
- Pricing: prices first — short head, one Monthly/Yearly switch, three cards with their own buttons. Pro shows $4.92 / month (struck $7, "billed $59 yearly · save 30%"), Lifetime $149 once includes **Needt Budget** (budget.needt.app, same account). Below: 12 "What Pro adds" cards, the comparison table (now with a Needt Budget group) and FAQ (+ "What is Needt Budget?").
- Home `og:image` is absolute.

## v21 (16.10.26)
- **Glyph pack** `assets/glyphs/` (46 SVG + `sprite.svg`): the app's own place glyphs (home, calendar, tasks, docs, mail, boards, moodboards, projects, habits, templates, focus…) exported with resolved colours (indigo accent), plus new ones drawn the same way (ai, connect, download, shield, rebuild, planday, bell, stats, booking, wallet, devices, book, blog, compare, glossary, api, spark, people, help, gift, settings, clock…). Generator: `sitegen/glyphs.py` → `glyph(name, size)`. Used in the header menus, the phone menu, "What PRO adds", the plans table and Download.
- Header: compact — the card is as wide as its content.
- Phone menu: two-column tiles (big glyph + name) for the 8 main places; secondary links stay in the footer and on the hubs.
- Pricing: "What PRO adds" with the app's dark PRO tag; the plans table is one white card with plan heads (price + button) and a glyph per row.
- **Download** rebuilt: a build bar (1 Oct → 30 Nov, time-based) with an "I want the app" button — each press adds a small nudge to this visitor's bar (kept in their browser), sparkles, sends `want-app` to Umami when enabled and opens an optional email form. Below: a horizontal, swipeable rail of three big cards — Web (available), Mac and iPhone (end of November) with device mock-ups and "use it today" steps.
- **Needs Claude Code:** the email form POSTs `{email, source:"apps"}` to `window.NEEDT_WAITLIST || https://use.needt.app/api/waitlist` — add that endpoint (and `connect-src https://use.needt.app` in the CSP), or set `window.NEEDT_WAITLIST`. Until then the form says it couldn't save.
- v21c: Pricing top is one Needt PRO card (price, Buy Pro, 14-day trial link); Lifetime is a small pill under it; Free is one line with a link (Log in / sign-up already lead there). Feature detail stays in 'What PRO adds' and the table.
- v22: Download is ChatGPT-style — no hero; three big alternating sections (Needt on the web → Open Needt; for Mac; for iPhone) with lots of air. Mac and iPhone carry a small "In the works · end of November" bar (time 1 Oct–30 Nov + the visitor's nudges) and a small "I want the … app" button that opens the optional email form.

## v23 (16.10.26)
- Brand: «Needt» in header/footer splits into letters and "inflates" (EXPO 0 → −95 → 0 + scale, wave by letter) on load (header) and hover. Off with reduced motion. Code: `.brand-word` block in app.js / site.js, `bwInflate` in styles.css.
- Download: premium nudge — hairline progress bar, outlined pill with pulsing dot, black state "You’re on the list". Confetti removed.
- App glyphs: `shell.decorate()` adds a glyph tile (`.rc-ic`) to hub cards by href (skipped when every card would get the same icon). Security cards and Help group headings carry glyphs too.

## v24 (16.10.26)
- One icon system: app glyphs with no tile/background, large (cards 40px, Pricing 38px, menu 30px, table 28px). Overrides at the end of styles.css and pages.css.
- Glyph viewBox fix: 14 glyphs are drawn on a 40-grid (`VB40` in sitegen/glyphs.py) and were clipped in a 24 viewBox (templates, focus, event, folder, habits, ics, import, later, markdown, page, sheet, stack, trash, tune). sprite.svg fixed too.
- Unique glyph per card on the Use cases, Learn and Glossary hubs (`_CARD_GLYPH_SPEC` in shell.py).
- Per-page OG cards: `assets/og/<slug>.jpg` (1200×630, 92 pages), wired into og:image. Rebuild: `python3 og_extract.py` → `node ogrender.js` (template `_og/og.html`, outside the site) → `python3 gen.py`. Home keeps assets/og.png.
- Conversion events (site.js + app.js, end of file): `checkout_click {plan: pro_year|pro_month|lifetime}`, `trial_click`, `try_free_click`, `want_app_click {app}`, `notify_submit {app}`, `open_web_app`, `budget_click`; each has `where` (nav/body/footer) and `page`. Sent to `window.dataLayer`, `plausible()` and `umami.track()` if present.

## Claude Code — open tasks (as of 16.10.26)
1. **Umami**: replace `data-website-id="__UMAMI_SITE_ID__"` in every page with the real ID (or serve the script from stats.needt.app with the ID). Without it no event is recorded. In Umami, create goals/funnel: page /pricing → checkout_click → payment success.
2. **Waitlist endpoint** `POST https://use.needt.app/api/waitlist` `{email, app: "mac"|"iphone", source: "download"}` → 200 `{ok:true}`. Store with dedupe on email+app; allow CORS from https://needt.app; add `connect-src https://use.needt.app` to the landing CSP. Until this is live, emails from the Download form are lost.
3. **Checkout params** in the app: `/settings?section=billing&checkout=pro-year|pro-month|lifetime` must open the right checkout directly (also after login redirect). Fire a server-side `purchase {plan}` event to Umami on success.
4. **Lifetime seats counter** (optional): `GET /api/lifetime-seats` → `{sold, total:300}`, cacheable 5 min. The landing will show "X of 300 left" only from this real number.
5. **Deploy** v24 via Coolify (static, no build). Check that `/assets/og/*.jpg` is served with `Content-Type: image/jpeg` and long cache.

## v25 (16.10.26)
- Night section: light and dark shots are clipped to complementary halves with `clip-path: inset(… round 18px)` (`--nt` now set on `.duo`), so no light fringe shows at the rounded corners.
- Integrations (home): new copy; marquee mixes calendars, mail, imports, AI clients and API, and every card is a link (integration page, Connect AI or API). Drag still works: pointer capture starts only after 6px, a drag never triggers a link. Legend is 4 link pills.
- Planning section (home): rebuilt for desktop as copy + 3 points and one app window with the Needt agent card over it; hidden under 900px.

## v26 (17.10.26)
- New buyer's guides under `/best/` (sitegen/p_best.py), targeting list queries: best AI planner apps, best time blocking apps, Motion alternatives, best planner apps for ADHD, Sunsama alternatives + hub `/best/`. Facts from content/compare.json (checked 11 Oct 2026); disclosure "We make Needt" on each. JSON-LD: Breadcrumb, Article, ItemList, FAQPage. Added to sitemap.xml, llms.txt, footer (Best apps), Resources hub.
- To avoid cannibalising `/best/motion-alternatives/` and `/best/sunsama-alternatives/`, compare/motion and compare/sunsama titles are now "Needt vs Motion (2026): …" / "Needt vs Sunsama (2026): …" and link to the guides.
- OG: per-page cards for /best/*; Pricing card has the line "Pro from $4.92/mo · Free plan · Lifetime $149 once".
- When competitor prices are re-checked, update content/compare.json and `CHECKED` in p_best.py, then regenerate.

## v28 (21.10.26)
- Phone (≤760px): hero and AI skies fade out over their last 260px (mask on `.sky-wrap`) into the next section.
- Phone: `.dusk-veil` is no longer a flat white→night opacity crossfade (it read as grey). Night now comes down from the top as a lavender dusk band driven by the same `--nt`; the headline is always on dark. Desktop unchanged.
- Cache-bust `?v=28`.

## v27 (18.10.26)
- MCP/Connect step screenshots (assets/steps/ai-tools.webp, connect-*.webp): cropped the 18px black bar at the bottom (1200×632 now). Originals were 1200×650.
- Hero: when a page has breadcrumbs, the eyebrow pill is no longer rendered (it repeated the crumbs).
- Pricing → Compare plans on phones (≤700px): segmented switch Free / Pro / Lifetime (default Pro), one plan column at a time; rows are flex. Code: `.ct-seg` in p_pricing_compare.py, CSS end of pages.css, JS end of site.js.
- Header wordmark: always slightly inflated (EXPO −22…−46) with a slow letter-by-letter breathing loop; hover/load inflate kept. Off with reduced motion.
- iOS Safari edge bars: the bottom sticky "Try it free" bar (.m-cta) is hidden; the fixed header box is now only as wide as the pill (no full-width fixed strip at the top); `html` gets the paper background. Needs a check on a real iPhone (Safari 26).

## v29 (27.10.26) — Needt Plugin and Needt Budget
- **New `/plugin/`**: the free Needt Plugin (v0.3.0, five skills: partner, prompt, search, asking, setup). Download is `plugin/needt.plugin` (28 KB, a zip; copied from `needt-plugin/needt.plugin`). Install steps for the Claude app, Claude Code (`claude --plugin-dir`) and ChatGPT/Codex. Event `plugin_download {where}`. When the plugin is rebuilt, copy the new `needt.plugin` over `plugin/needt.plugin` and update the version/size/date in the hero, the install row and llms.txt.
- **New `/budget/`**: Needt Budget in Budget's own look (icy ground, cyan, dark panels). Included in **Pro** (and Lifetime), or **$2 once** via `https://budget.needt.app/buy`. Screens in `assets/budget/` are from a local preview with the seeded demo database (`scripts/seed_preview_db.py`, labels in English), never the real one.
- Pricing: Needt Budget rows are now ✓ for Pro; FAQ and Lifetime pill say "included"; a "Needt Budget is included" banner under "What PRO adds".
- Home: "More from Needt" band (Plugin + Budget) before the night section.
- Header Product menu: Needt Plugin (Free tag) and Needt Budget; footer Product column: both links. sitemap.xml and llms.txt updated.
- Cache-bust: styles.css/site.js/app.js `?v=43`, pages.css `?v=28`.
- Edited in place, not through sitegen (the device copy was ahead of sitegen's output). OG images for the two pages fall back to `assets/og.png`.

## v30 (28.10.26) — "More from Needt" style, header deck, live screens
- **Sub-project style** `sub.css` + `sub.js` (loaded only by `body.sub` pages): white, hairlines instead of shadows, Exposure display, one accent per project (`--acc`; Plugin indigo, Budget cyan via `body.sx-budget`). New sub-projects: copy a page, set `<body class="page sub sx-yourname">`, define `--acc/--acc-2/--acc-soft`.
- **Header "More"** (all pages, after Download): a 2×2 dot glyph that turns into a diamond, opens a dark panel that reveals from the button (clip-path lens) and deals three cards from a stack (Plugin · Budget · Soon) with pointer tilt + glare. On phones it is a section inside the burger menu. Code: end of `site.js`/`app.js` (`"More" (v44)`), CSS end of `styles.css` (`v44`). The panel is moved to `<body>` on desktop (the header pill clips its children).
- **/plugin/** rebuilt: seven skills (six free + `/needt` on Pro). Live stage: an AI chat types a request, the real Needt tool runs (`needt_create_task`, `needt_list`, `needt_log_habit`, `needt_reschedule`) and the phone shows the real app screen (captured from the frozen prototype, neutral demo data, `assets/plugin/app-*.webp`). Five scenes, auto-advance while on screen, tabs to jump, paused on hover. Live windows for partner, search, prompt, asking, critic, setup reveal line by line.
- **/budget/** rebuilt in the same style: three long real screens (`assets/budget/f-*.webp`, demo DB) that scroll on their own while in view.
- Copy says the free skills are in "your AI's skill library" — keep that true (directory listing) or change the wording. `plugin/needt.plugin` is still v0.3.0 (5 skills: no `/needt`, no `critic`); replace it when v0.4 is packed.
- Cache-bust: styles/site/app `?v=44`, `sub.css`/`sub.js` `?v=2`.

## v31 (28.10.26)
- Plugin file is now **v0.5.1** (52 KB, 7 skills incl. `/needt` and `critic`). Partner section rewritten to the new partner (loop, routes to other skills, reads connected tools, 2–4 ideas, money verdict, plans).
- Install section: real channels — GitHub `teenxgrailed/needt-plugin` (plugin in `plugins/needt`), `claude plugin marketplace add …` + `claude plugin install needt@needt`, `codex plugin marketplace add …`, `.plugin` upload in the Claude app, MCP server `https://mcp.needt.app/mcp` for Cursor and others. "Also in": MCP Registry, Glama, Smithery, mcp.so, MCP Market (in review), Claude Directory and ChatGPT/Codex (in review). When a review passes, change its chip from "in review" to a link.
- Icons: `assets/budget/icon.svg` = Budget's own mark (copied from Needt-budget `static/favicon.svg`); `assets/plugin/icon.svg` = new Plugin icon (a slash command orbited by seven skills; the big amber one is /needt). Used in the sub-page heroes, lockups, favicons, the header deck, the Product menu and the home band. Budget page links to budget.needt.app (hero meta, a button, the clickable site preview).
- Cache-bust: styles `?v=46`, sub `?v=5`.

## v32 (29.10.26) — new home, devices, /students/
- **Home order:** hero → One place → More from Needt (Plugin + Budget) → Tour → Planning → Small details → Integrations → Devices → Night → Final.
- **Hero:** the live window is now the real Calendar week (`assets/cal-before.webp` / `cal-after.webp`, neutral persona Alex). Loop in `app.js`:
  - the agent drags the Wed 16:00 client call to 10:00;
  - "Photograph the products" moves to 16:00, "Pick the courier" to 17:00;
  - the toast appears and the agent presses Keep.
  - The loop plays only while the hero is visible. Reduced motion shows the final frame.
  - New headline: "Plans move. Your day keeps up."
- **#more-needt:**
  - Plugin card: a `/needt` chat with a `needt_reschedule` tool call, revealed in steps.
  - Budget card: the long `f-home.webp` screen scrolls slowly.
  - Generated by `lp/wire.py`; it now sits after One place.
- **#devices:** official Apple bezels (Apple Design Resources) with real prototype screens in `assets/devices/`:
  - MacBook Pro M5 14";
  - iPad Pro M5 11";
  - iPhone Duo inner open;
  - iPhone 18 Pro.

  Status chips: Web now; iPad and iPhone Duo in the browser now; Mac and iPhone apps end of November.
- **/students/:**
  - 40% off Pro: $35.40/year ($2.95/month) or $4.20/month. Lifetime is not discounted.
  - CTA: `https://use.needt.app/auth/signin?plan=student` (class `js-signup-student`, not rewritten by site.js). Fallback: students@needt.app.
  - Built by `lp/build.py`, accent orange (`body.sx-students`).
  - Linked from:
    - the header More deck (replaces the "Soon" card);
    - the footer Product column (Student discount);
    - Pricing, under the Pro card;
    - /for/students/;
    - sitemap and llms.txt.
- **Pricing:** "Every device" card no longer promises Windows/Android/Mac apps.
- **Cache:** `styles.css?v=47`, `site.js`/`app.js?v=45`, `sub.css`/`sub.js?v=6`.
- **Backend needed for /students/** (the page promises it): `?plan=student` handling, auto 40% for university emails, a Creem discount code for the manual path. Prompt in the chat of 29.10.26.

## v33 (29.10.26) — smoother, roomier, inset skies on phones
- **Speed:**
  - The Safari bar-colour script runs only in Safari, once the scroll settles, and no longer reads the canvas. Before, it ran every frame and was the most expensive scroll handler.
  - The header wordmark breathes once instead of forever. It used to re-layout the header every frame.
  - Phones draw each sky once and keep it still (`sky.js` v28).
  - The hero no longer has floating cards.
  - Chromium test, 2× CPU slowdown on desktop, scrolling the home page: script 682 → 344 ms, style recalc 1309 → 270 ms, frame p95 50 → 33 ms. On a phone at rest, nothing runs.
- **Phones (≤860px):**
  - Every sky is an inset rounded card on paper (8px margin, 30px radius): hero, Planning, night zone, inner-page heroes and footers, the Pricing hero.
  - html and body stay paper, so Safari's bars always sample paper. This fixes the coloured lines around the URL bar over dark sections.
  - The night section no longer pins and starts dark. The dusk veil is off.
- **Hero on phones:** the video sits inside the official iPhone 18 Pro bezel (`assets/devices/iphone-bezel.webp`).
- **Layout:**
  - Sections have more air: padding clamp(120px, 13vw, 200px); 104px on phones.
  - The hero chip is gone.
  - The headline breaks as "Plans move. / Your day keeps up."
  - The devices section now sits before the night zone, on paper.
- **Cache:** `styles.css?v=48`, `site.js`/`app.js?v=46`, `sky.js?v=28`.

## v34 (29.10.26) — section pass
- **Desktop:**
  - Cards have a 24px radius and 30px padding.
  - Grids have a 20px gap and 64–88px above them.
  - Plugin and Budget cards have 40px padding; "Needt Budget" sits on one line.
  - The Small details head is centred like the others.
- **Phones:**
  - Gutters are 28px, and 36px inside inset sky cards.
  - Sections have 136px padding.
  - Hero, heads, cards and lists all have more room.
  - The Planning section is back on phones, stacked: copy, points, the day, and the agent card over it.
- **Cache:** `styles.css?v=49`.

## v35 (29.10.26) — still clouds, app in the clouds, Updates, new Download
- **Skies:** every sky is drawn once and stays still, on desktop and phones (`sky.js` v29). It no longer redraws on scroll or on pointer movement. Chromium, 2× CPU slowdown, scrolling the home page: script 344 → 98 ms, 0 long tasks.
- **Hero:** a strip of the hero's own cloud sea (`assets/hero-clouds.webp`, `-m.webp` on phones) lies over the bottom of the window. On phones it lies over the bottom of the phone, and the phone's sky card now runs the full hero height. The toast moved up, and the cursor goes straight to Keep without its bubble.
- **Updates** (`#updates`, built by `lp/updates.py`): after More from Needt, a dated list: Mac and iPhone apps (coming), students, Plugin, Budget in Pro, new look, agent on every plan. Link to the changelog.
- **Budget card:** back to the v31 look (tilted b-home screen).
- **Devices section:** no longer Apple-only. Copy and chips: web, Windows · Linux · Android, iPad · iPhone · foldables, Mac and iPhone apps (end of November). Link to Download.
- **/download/** (built by `lp/download.py` from `lp/download.orig.html`): the devices hero with chips, then cards for Web, Mac (progress and "I want it"), iPhone, Windows/Linux/Android, and the Plugin. Classes use the `dlp-` prefix.
- **Phones:** the header and menu stay light over the night card. The dark theme used to make the open menu unreadable. Hover lift is off on touch.
- **Cache:** `styles.css?v=50`, `site.js`/`app.js?v=47`, `sky.js?v=29`.

## v36 (29.10.26)
- **Phones:**
  - The home hero is full-bleed again: no side margins, no rounded corners. The top of the home page on iOS is lavender, as in v40. Other skies stay inset cards.
  - The phone sits higher and less of it is in the clouds.
  - The video corners are clipped, so no white corners show behind the bezel.
  - The hero fades into the page below.
- **Mobile menu:** Pricing and Download are two centred tiles side by side.
- **Cache:** `styles.css?v=51`.

## Deployed as one release (31.10.26)
- The owner's export (v32–v36 above) was merged onto branch `landing`. Branch facts the export did not have were kept:
  - Trial copy: "14 days of Pro, free. Add a card only if you keep Pro." (#394). The export said "no card" again.
  - MCP address `https://mcp.needt.app/mcp` everywhere; `/resources/mcp/` lists the real 32 tools; API reference has PATCH `/tasks/:id`, `/today`, `/highlight`, `/habits/today`, `/reminders`, `/notifications`, `/ops` and scopes.
  - Pricing: Free has no hosted AI, 3 habits, no goals; renewal and cancel lines under the buttons (#469). Terms: 16+, DMCA (#469).
  - Changelog entries for 25, 27 and 28 Oct. The plugin page does not claim Claude Directory or ChatGPT listings.
  - `/press/` (press-kit image files; there is no `/press/index.html`).
- Home "Lately" band dropped: the owner's Updates list replaces it. Updates rows fixed: Free has no hosted AI; 28 Oct entry added.
- `/students/` says "coming soon": the student price is not configured in Creem and `?plan=student` is not handled yet. CTAs go to students@needt.app until it is live.
- Cache: `site.js?v=48` (Free-plan note on Pricing).
