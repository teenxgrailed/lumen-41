# needt.app — marketing site (v19, 12.10.26)

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
- Assets are cached 30 days `immutable` by nginx, so CSS/JS are linked with `?v=19b` — bump it on every change.
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
