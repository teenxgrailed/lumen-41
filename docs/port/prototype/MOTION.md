# Needt — motion inventory

Every animation and transition the mounted prototype runs (`index-dev.html`, `mobile-dev.html`; labs, `animations-v3`, `film`, `nav-b/c` excluded), per screen, read from the code on 08.10.26. Port these numbers, not new ones. Rows cite `file:line`. Rule breaks are listed under **Violations** at the end. Items fixed in the 08.10.26 loops / reduced-motion pass (desktop + shared code) are marked **Fixed** there; the rest are still open.

**The rules this is checked against** (PORT.md has no motion section of its own; its only motion rule is §5.5, the sky. The rules come from):
1. Animations run only on events: open, close, change, hover, press, drag. **Nothing loops at rest.** The exceptions are a spinner or skeleton while something loads, and the AI orb, caret and shimmer while the AI is working. (scratch `rules.md`; `HANDOFF.md` "Motion"; `AiOrb.jsx:10`; `ExposureWordmark.jsx:124`)
2. Durations come from the scale below (DS `tokens/motion.css` plus the 06.10 motion pass `app.css:613-617`).
3. **Every motion respects `prefers-reduced-motion`.** Movement becomes instant or a fade. A spinner may keep turning, because the DS says rotation is the message.
4. Entry animations do not hold state. Use fill `backwards`, not `both`, on broad selectors. (`HANDOFF.md` "Motion"; `chat.css:4-7`)
5. Sky: 20–24 fps while the page is in use, stopped at rest (no input for 12 s), paused when hidden or off-screen, one still frame under reduced motion (PORT §5.5).

**Column key.** Dur = duration in ms (s where stated). The **Reduced motion** column uses these terms:

| Term | Meaning |
|---|---|
| **1 ms** | the duration is forced to 1 ms, so the change is instant |
| **none** | `animation: none` or `transition: none` |
| **fade** | replaced by an opacity fade |
| **—** | no rule of its own (listed under Violations). Since 08.10.26 the global rule (`styles/base.css:116-133`) still makes it **1 ms** on every page that loads `styles/base.css` |
| **global** | handled only by the global reduced-motion rule: 1 ms, no delay, one iteration |

Curve names are exact aliases, defined under Global → Curves.

---

## Global

### Curves

| Alias | Value | Defined |
|---|---|---|
| `ease-pop` | `cubic-bezier(0.2, 0.9, 0.3, 1)` | DS `tokens/motion.css:34` |
| `nx-ease` | `cubic-bezier(0.2, 0.9, 0.24, 1)` (also written out literally in many places) | `app.css:617` |
| `chat-spring` | `cubic-bezier(0.22, 1.28, 0.36, 1)` (overshoots) | `styles/chat.css:9` |
| `chat-out` | `cubic-bezier(0.4, 0, 1, 1)` | `styles/chat.css:9` |
| `ease` / `ease-in` / `ease-out` / `linear` | CSS keywords | — |
| `soft` | `cubic-bezier(0.2, 0.7, 0.2, 1)` (paywall phone frame, MbSheet, auth-enter, drop-ins, AI orb ease) | many |
| `soft-8` | `cubic-bezier(0.2, 0.8, 0.2, 1)` (promo cards, docs panels, sb-swap) | many |
| `sine` | `cubic-bezier(0.37, 0, 0.63, 1)` (Time view-transition, find-bar) | `themes.css:111` |

### Motion tokens and the duration scale

| Token / step | Value | Use | Source |
|---|---|---|---|
| `--duration-pop` / `--transition-pop` | 120 ms `ease-pop` | DS overlay arrives (menu, popover, datepicker, scrim) | DS `tokens/motion.css:29,35` |
| `--duration-screen` | 140 ms | screen arrives (`needt-screen`, 3 px rise) | DS `:30` |
| `--duration-hover` / `--transition-hover` | 150 ms `ease` | hover, press, reveal: colour, background, shadow | DS `:25,28` |
| `--duration-theme` / `--transition-theme` | 250 ms `ease` | theme crossfade | DS `:24,27` |
| DS reduced motion | pop, screen and all `--transition-*` → 0.01 ms linear | | DS `:40-48` |
| **Global reduced motion** | every CSS animation and transition (incl. pseudo-elements, inline `style` animations/transitions): duration 1 ms, delay 0, iteration-count 1, `!important`. Spinners exempt (`.nt-spinner`, `.st-spin`, `.pw-spin`, `.auth-row-spin`, `.ml-spin`, `.cn-spin`) | | `styles/base.css:116-133` |
| `--nx-in` | 180 ms `nx-ease` | menu or popover in (`nx-pop`, `nx-up`) | `app.css:617` |
| `--nx-out` | 130 ms `ease-in` | menu or popover out; the `useExit` default | `app.css:617`, `motion.js:16` |
| press-down | 90 ms | `:active` scale 0.965–0.97, then spring back on the 160 ms transition | `app.css:166-172` |
| sheet / scrim out | 170 ms `ease-in` | `nx-sheet`, `nx-scrim`, toast, paywall | `app.css:634-636,666` |
| scrim in | 220 ms `ease` | `nx-scrim` | `app.css:633` |
| swap / fold | 240 ms `nx-ease` | `nx-swap`, `nx-fold` | `app.css:637-638` |
| collapse / toast in | 260 ms `nx-ease` | sidebar collapse, `nx-toast`, `mb-side` | `app.css:654,665,794` |
| sheet in | 280 ms `nx-ease` | `nx-sheet` | `app.css:635` |

The scale is therefore **90 · 120 · 130 · 140 · 150 · 170 · 180 · 220 · 240 · 250 · 260 · 280** ms. Anything else counts as off-scale: see V-D.

**`useExit(open, ms)`** (`motion.js:7-18`) keeps a closing surface mounted for `ms` (default 130) and sets `is-leaving` so the exit keyframe can play. Under reduced motion it unmounts at once (no `is-leaving`, no wait) (`motion.js:14-17`; was V-C16, fixed).

**Recipe reduced motion** (`app.css:646-648`): `.nx-pop`, `.nx-up`, `.nx-scrim`, `.nx-sheet`, `.nx-swap` and `.nx-check svg` get `animation-duration: 1ms !important`. `.nx-fold`, `.nx-press` and `.nx-check` get `transition: none`. The inline `nx-swap` rows (popovers, search, topbar, sidebar-kit) now carry the `.nx-swap` class, with only a non-default duration and the stagger delay inline. Anything else (`.sb-tile`, `.tk-block`, `.nx-toast`, inline transitions) is caught by the global rule (`styles/base.css:116-133`).

### Shared keyframes

| Keyframes | From → to | File:line | Used by |
|---|---|---|---|
| `needt-spin` · `needt-pop` (scale .96) · `needt-pop-modal` (.975) · `needt-fade` · `needt-screen` (Y 3 px) · `needt-landed` | | DS `tokens/motion.css:51-82` | DS overlays, `.screen-enter` |
| `nx-pop-in`/`-out` (Y −6 / scale .97 → none; out −4 / .98) | | `app.css:618-619` | `.nx-pop` |
| `nx-up-in`/`-out` (Y +6 / .97) | | `app.css:620-621` | `.nx-up`, `.focus-exit` |
| `nx-sheet-in`/`-out` (Y 14 / .965; out 8 / .975) | | `app.css:622-623` | `.nx-sheet`, `.mb-drop` |
| `nx-fade-in`/`-out`, `nx-scrim-in` | opacity | `app.css:624-625,1137` | scrims |
| `nx-swap` (Y 6 → 0, fade) | | `app.css:626` | `.nx-swap`, `.sb-tile`, `.tk-block`, inline list rows |
| `nx-tick` (0.5 → 1.12 → 1) | | `app.css:627` | check glyph |
| `nx-toast-in`/`-out` (Y 12 / .96; out 8 / .98) | | `app.css:663-664` | `.nx-toast` |
| `hd-spring` (0.6 → 1.15 → 1) · `hd-strike` (scaleX 0 → 1) | | `app.css:683-684` | Home check reward |
| `needt-menu-row` (Y −5) · `needt-land` (Y 7, .9, blur 2 → overshoot −1 / 1.02) · `needt-tick` (0.4 → 1.16 → 1) + `needt-tick-ring` (0 → 10 px) · `needt-tab-fill` (blur 2 → 0) · `needt-rise` | | `app.css:137,181,195,205-209,218` | DS menu rows, chips, checked controls, nav rows, screen cards |
| `needt-nf-in`/`-out` | | `app.css:118,124` | notifications |
| `needt-ac-in`/`-out` | | `app.css:86,91` | agent cursor arrow |
| `needt-section-in` (Y 6) · `needt-saved` · `needt-auth-in` (Y 10) · `needt-drop-in` (scaleY .9) · `needt-count-bump` · `needt-flame-body`/`-core` | | `app.css:305,307,313,333,362-368,390` | Settings, auth, calendar drop, RichBlock, Flame |
| `needt-aura` · `needt-focus-ring` · `needt-caret` · `sb-urgent`/`-bg` · `mb-shimmer` · `st-shimmer` · `st-spin` · `sb-swap-in` · `dc-bd-in`/`-out` · `mb-side-in`/`-out` | | `app.css:279,288,248,701-709,796,1054,1110,925,956,978,792-793` | see screens |
| `needt-breathe`, `needt-lean`, `needt-mark-puff`, `needt-dot`, `needt-island-*`, `needt-veil-*`, `needt-step-*`, `needt-aurora`, `needt-mini-*`, `needt-co-discharge` | | `app.css:30-52,251,259-270,297-301,315-329`; `composer.css:78` | **not used** by mounted JSX (dead CSS; do not port) |
| `needt-co-arrive` · `-glow` · `-flight` · `-bar` | | `composer.css:41,56,135,164` | Composer, Help, Bug |
| `ew-develop` · `ew-lean` | | `exposure-wordmark.css:64,72` | wordmark |
| (none: the AI orb has no CSS loop) | | `styles/base.css:87-91` | AI orb: still frame at rest; motion is WAAPI in `AiOrb.jsx` (rows below). `ai-orb-turn` / `ai-orb-breathe` removed 08.10.26 |
| `chat-*` | | `styles/chat.css:25-32,117-119,130,141,151,170,179,318-321` | Chat |
| `fc-*` | | `styles/focus.css:16-25` | Focus window |
| `tdc-in`/`-fade`/`-pop` | | `styles/tasks.css:213-215` | task card |
| `sb-acct-*` | | `styles/shell.css:455-458` | account menu |
| `ob-sb-bob` (settle, once)/`-land`/`-back` · `auth-row-spin` | | `styles/auth.css:232,235-238,83` | onboarding |
| `ma-menu-nudge` · `ma-menu-land` | | `styles/mobile-onboarding.css:22,42` | phone onboarding |
| `mb-spin`, `mb-in`, `mb-sk`, `mbm-push`/`-up`/`-fade`/`-tile`/`-ring`/`-pop`/`-spin` | | `styles/mobile.css:629-642` | phone |
| `pw-spin` · `pw-promo-out`, `pw-in`/`-out`/`-fade`/`-fade-out` | | `styles/paywall.css:57`; `paywall.jsx:192-197` | paywall |
| `ax-step-fwd`/`-back` · `cn-spin` · `ml-spin` | | `AuthScreen.jsx:14-15`; `connections.jsx:142`; `MailScreen.jsx:36` | |

### JS-driven motion (springs and frame loops)

| What moves | Duration | Curve / spring | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Agent cursor travel | `clamp(210 + 190·log2(d/90 + 1), 300, 760)` | minimum-jerk `10t³ − 15t⁴ + 6t⁵`, one quadratic bezier path, rAF `translate3d` | `__agent.run` (Plan my day) | placed at the target, no flight | `AgentCursor.jsx:50,55,115` |
| Agent arrow in / out · arrow rotate · load · say | 300 / 260 · 120 · 160 · 300 | `(0.2,0.8,0.24,1)` / `chat-out` · `nx-ease` · `(0.2,0.7,0.2,1)` · `nx-ease` (`needt-land`) | step start / end | arrow keyframes none; load and say — | `app.css:83-99` |
| Drag (desktop, wave 3): the picked item itself lifts — a clone in a fixed layer, the source hidden as the gap; follows the pointer 1:1 | per frame (rAF) | lift: scale 1.02 + `--shadow-floating`, 180 `cubic-bezier(0.2, 0.9, 0.3, 1.2)`; lean = the pointer's x-velocity, clamped ±3°, decays ×0.8 per frame | press + 4 px | no lean, no lift easing | `Drag.jsx` `lift` / `paint`; `shell.css` `.shell-drag-lift-card` |
| Drag: rows of its list make room (transform only) | 200 | `cubic-bezier(0.2, 0.8, 0.2, 1)` | the gap moves | instant | `[data-drag-shift]` |
| Drag: drop settles into the gap / flies into the new calendar block / back home (missed, Esc) | 320 (fallback 420) | `cubic-bezier(0.3, 1.25, 0.45, 1)` (a small overshoot); the source row flips into place 300 | drop | instant | `Drag.jsx` `flyTo`, `settleSource`; `.shell-drag-lift.is-settling`, `[data-drag-flip]` |
| Drag: a target under the hand (`data-drag-over`: sidebar project row, mini-month day, focus) highlights; the tag under the card says the time / day / "Move to …" | tag 160 | `ease` | hover a target | tag without motion | `shell.css` `[data-drop][data-drag-over]`, `.shell-drag-lift-tag` |
| Drag edge auto-scroll | per frame | faster the deeper the pointer is in a 56 px edge band | drag near a scroller edge | — | `Drag.jsx` `useDrag` |
| Wordmark develop-in | 620 + 85/letter | `cubic-bezier(0.215, 0.61, 0.355, 1)` | mount | none; EXPO 0 | `exposure-wordmark.css:64-69,92-96`; `ExposureWordmark.jsx:359` |
| Wordmark breathe | one wave, 5200 (260 ms/letter phase); amplitude out 250 / in 400 | ease-in-out; then the rAF stops | after develop-in | off | `ExposureWordmark.jsx:22-41,124-128` |
| Wordmark torch / busy | spring / 300 in, 400 out | spring `{stiffness 220, damping 26, mass 1}`, `F = −k·x − c·v`; busy ease-out | pointer within 180 px / `busy` prop | off | `ExposureWordmark.jsx:61,263-282` |
| AI orb settle on mount | 1400 | film rotate −60° → 0 `(0.2,0.7,0.2,1)`; glow ease-in-out (WAAPI, then cancelled) | mount, hover, focus | nothing plays | `AiOrb.jsx:46-53` |
| AI orb working loop | film 9 s/turn linear; glow 7 s ease-in-out; infinite while `active`, **one iteration** on hover/focus | WAAPI | `active` (AI thinking or streaming); hover / focus (one cycle, then cancelled) | nothing | `AiOrb.jsx:55-71,103-107` |
| AI orb stop | `max(240, min(900, left·5))`; glow 420 | `(0.3,0.6,0.3,1)`; glow ease-out | `active` ends / pointer leaves mid-cycle | nothing (no loop to stop) | `AiOrb.jsx:73-85` |
| Theme: Time (follows the sun) | colour 1.5 s; light ↔ dark flip 1.2 s | `ease`; view transition `sine` | minute tick / sun crossing | no transition, no view transition | `themes.css:105-114,431`; `Drift.jsx:254-260` |
| Theme crossfade | 250; ambient `--dt-amb` 400 | `ease` | theme or accent change | 0.01 ms (token) | `themes.css:427-428` |
| Smooth scroll `.scroll-inner` | browser | smooth | scrollTo | `auto` | `app.css:224,231` |

### PxSky, the printed sky (`scenes.jsx`)

Used by Connections, Templates and Shared headers, the paywall, auth and onboarding, the Settings promo, the sidebar Pro strip, the Focus window and the phone paywall and onboarding.

| Aspect | Value | Src |
|---|---|---|
| Frame rate while drifting | input in the last 12 s: full sky (> 500k px²) **20 fps** (50 ms), alternating a field frame and a dot frame; small sky **24 fps** (42 ms, clock stepped by 42 ms so 60 Hz gives an even 33/50 ms cadence) | `scenes.jsx:393-394,883,1185-1203` |
| Rest | one shared idle detector (`pxRest`, passive window listeners: pointermove, pointerdown, keydown, wheel, touchstart; tab visible again). No input for **12 s** → drift speed eases to 0 over **1.5 s** (linear ramp `fl`, speed = smoothstep(fl)), then, once hover / calm easing has settled, one full frame and **no more frames** (last frame stays). Any input → drift eases back up over **0.8 s**. Speed is eased, never position: `pos` and the animation clock `ta` (morph, breathing, promo sway, star twinkle) are integrated, so stop and resume never jump. Programmatic scroll does not wake it | `:286-319,365-369,833-840,1188-1213` |
| Frame rate while hovered | pointer in the sky, or a hover still easing (`mouse.on`, `amp > 0.02`, `\|hovOn − hov\| > 0.003`): small sky at **display rate** (16 ms gate), full sky **30 fps** with a full field every frame. A pointer resting in the sky with no input also comes to rest after 12 s | `:1196-1205` |
| Drift | `pos += dt · speed · vPx`, vPx = W/110 px/s clamped 5–14, speed = smoothstep(`fl`) (1 in use, 0 at rest); cloud morph rate `PX_MORPH` = 2.2 on the eased clock `ta` | `:266-267,831-840` |
| Hover easing | time-based: `ez(f, k) = 1 − (1 − k)^f`, f = dt·30 (tuned at 30 fps, so 20 fps eases equally fast). Cursor follow k = 0.3; brush amplitude k = 0.06; promo hover ("clouds part") k = 0.16; calm map (words keep clear) k = 0.1 | `:817,841-849,862-865,619` |
| Pointer radius | R = 170 px (in field cells) | `:866` |
| First frame | canvases fade in, opacity 220 ms `ease` | `:1252-1256` |
| Paused | tab hidden; off-screen (IntersectionObserver); fully covered by an opaque element (5-point check, once per second) | `:1187,1215,1231,1270-1283` |
| Reduced motion | no loop: one still frame at t = 42 s, redrawn only when the palette or calm map changes, on scroll end and on hover state; no first-frame fade | `:331-332,431,831-833,1254,1276-1282,1294,1302` |
| Entry animations on the sky | forced to fill `backwards` (`.nx-swap`, `.nx-pop`, `.pw-print-in`, `.ax-step`, `.mb-step`) | `:1377-1380` |
| Glass card hover | lift −2 px; transform 220 `nx-ease`, shadow 220 `ease`; reduced motion: none | `:1360-1368,1411` |
| Page dots | width 260 `nx-ease`, opacity 200; reduced motion: none | `:1339,1345` |

---

## Desktop

### Shell (every screen)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| New screen (fade + 3 px rise, fill `both`) | 140 | `ease-pop` | route change (`key={view}`) | 0.01 ms | `App.jsx:584`; `app.css:69,238` |
| Cards and sections inside the entering screen (rise) | 460; delays 20–200 (articles), 0–120 (sections) | `nx-ease` | screen mount | none | `app.css:137-156,226-228` |
| App ↔ doc-rail swap (X −6 → 0) | 200 | `soft-8`, fill `both` | doc rail on/off | — | `App.jsx:523`; `app.css:925-926` |
| Any button / menuitem / nav row press | 90 down; back 160 (transform) / 200 (shadow) / 150 (bg, colour) | `nx-ease` | `:active` | — (only hover transforms are cancelled) | `app.css:169-172` |
| `.nx-btn` | 140; press 90 | `nx-ease` (transform), `ease` | hover / press | none | `app.css:732,746,768` |
| `article` hover lift −1.5 px / press .997 | 240 / 90 | `nx-ease` | hover / press | transform none | `app.css:162-164,231` |
| Nav row hover X +2 px; current row's contents un-blur | 160 / 280 | `nx-ease` | hover / route | none | `app.css:176,219,229-231` |
| Checked control tick + ring (`[aria-checked=true]`, `[data-state=checked]`) | 320 + 600 | `nx-ease` + `ease-out` | **mount** of any checked element | none | `app.css:205-210,228` |
| DS chip / status-dot "lands" | 360 | `nx-ease` | mount | none | `app.css:195-200,228` |
| Chat column width 0 ↔ 360 | 220 | `nx-ease` | Ask Needt open/close | — | `App.jsx:606` |
| Focus aura (corners breathe 0.34 → 0.8 → 0.34, then hold 0.34) | 6 s, **once** | ease-in-out | focus session starts (aura mounts) and the aura setting is on | none; held at 0.5 | `App.jsx:572`; `app.css:276-294` |
| Exit-focus button | 220 | `nx-ease` (`nx-up-in`, `both`) | focus mode on | — | `App.jsx:567`; `app.css:660` |

### Sidebar

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Collapse/expand: width + opacity; aside X −24 px | 260 / 200; 260 | `nx-ease` / `ease` | toggle | — | `App.jsx:556`; `app.css:654-657` |
| Collapsed rail: opacity + X −12 px | 180 (out) / 220 + 40 delay (in); 260 | `ease`; `soft-8` | sidebar hidden or focus mode | — | `App.jsx:558` (inline) |
| Floating sidebar (< 1100 px): panel slide; transparent scrim fade | 260; 220 | `nx-ease`; `ease` | open over the content | — | `App.jsx:547`; `app.css:1136-1137` |
| Place tiles enter (`nx-swap`, `both`), 25 ms stagger | 240 | `nx-ease` | the tile set changes (mount) | — (`.sb-tile` is not `.nx-swap`) | `Sidebar.jsx:692,700`; `app.css:659` |
| Place tile hover / press .97 | bg 140, shadow 160, transform 140; press 90 | `nx-ease` | hover / press | none | `app.css:864-866,883` |
| Rows, head buttons, foot icons | bg/colour 120, press 90; count/more opacity 120 | `ease` | hover / press | none | `app.css:835-844,879,883` |
| Section chevron rotate | 220 | `nx-ease` | fold | none | `app.css:829,883` |
| Section fold (`nx-fold`) | rows 240 / opacity 200 | `nx-ease` / `ease` | fold toggle | none | `Sidebar.jsx` (`nx-fold`); `app.css:638-648` |
| Urgent tile wash | 3.4 s × 3, then still (`.is-rested`) | ease-in-out | the tile turns urgent | none | `Sidebar.jsx:464-470`; `app.css:701-712` |
| Progress (clip-path) | 520 | `nx-ease` | count changes | none | `app.css:875,883` |
| Foot Focus/Import label reveal: max-width, gap, padding / opacity | 180 / 140 | `nx-ease` / `ease` | hover / focus / open | none | `styles/shell.css:407-420` |
| Running focus pill ring (1 → 3 → 1 px, then holds 1 px) | 6 s, **once** | ease-in-out | session starts or resumes from pause | none | `Sidebar.jsx:325`; `app.css:289-294` |
| Focus pill clock arc (stroke-dashoffset) | 400 | `linear` | each tick (state-driven progress, allowed) | global | `Sidebar.jsx:331`; `styles/shell.css:89` |
| Find-bar label fade | 340 | `sine` | hover | — | `Sidebar.jsx:49`; `styles/shell.css:70` |
| Up menu (`nx-up`) | 180 in / 130 out; `useExit` 130 | `nx-ease` / `ease-in` | open/close | 1 ms | `Sidebar.jsx:145-147` |
| Account menu (Y −4, scale .96) | 180 in / 140 out; `useExit` 140 | `nx-ease` / `ease-in` | profile button | fade | `Sidebar.jsx:212`; `styles/shell.css:453-461` |
| Sidebar toggle menu: card (`nx-pop`); rows inline `nx-swap` | 180 / 130; rows 220, delay 30 + 25i | `nx-ease` | open | 1 ms (rows are `.nx-swap` class) | `sidebar-kit.jsx:66,92-93` |
| Customize sidebar sheet + scrim | 280 / 220 in, 170 out; `useExit` 170 | `nx-ease` / `ease`, `ease-in` | open/close | 1 ms | `sidebar-kit.jsx:150` |
| Customize: reordered row FLIP | 200 | `nx-ease` | drop | — | `sidebar-kit.jsx:118-125` |
| Segmented thumb (topbar / switcher) | 260 | `nx-ease` | value change (double rAF) | — | `topbar.jsx:58`; `sidebar-kit.jsx:199`; `styles/shell.css:131` |

### Home / Today (`HomeToday.jsx`, `task.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Day ↔ Week-ahead: side and list swap | 240 | `nx-ease` (`both`) | tab change | 1 ms | `HomeToday.jsx:729,743` |
| Cards, empty state, big numbers ("n done", "days closed") | 240 | `nx-ease` | mount / value change (`key`) | 1 ms | `HomeToday.jsx:151,174,214,268` |
| Card hover (transform, shadow) | 150 | `ease` | hover | — | `styles/home.css:141` |
| Check reward 1: box springs 0.6 → 1.15 → 1 | 360 | `nx-ease` | check | 1 ms | `app.css:683,688,695` |
| Check reward 2: line draws through the title | 280 | `nx-ease` (`both`) | check | 1 ms | `app.css:684,689-691` |
| Check reward 3: row folds (rows, opacity) | 260 / 220, starts at 600; unmounted at 870 | `nx-ease` / `ease` | 600 ms after check | transition none (the timers still run 600/870) | `HomeToday.jsx:576-579`; `app.css:685-694` |
| Row returns from Done (`nx-swap`) | 240, flag held 320 | `nx-ease` | uncheck | 1 ms | `HomeToday.jsx:585`; `task.jsx:270` |
| Check glyph tick (on a real toggle only) | 260 | `nx-ease` | toggle | 1 ms | `task.jsx:101-110`; `styles/tasks.css:427-434` |
| Folds (Done today, week days) | 240 / 200 | `nx-ease` / `ease` | fold | none | `HomeToday.jsx` (`nx-fold`); `app.css:638-648` |
| Day-load bar width | 520 | `nx-ease` | load changes | — | `styles/home.css:208` |
| Inbox row fade | 200 | `ease` | add/remove | (opacity) | `styles/home.css:95` |
| Plan my day | see Agent cursor (Global) | | | | `HomeToday.jsx:557-562` |

### Calendar (`CalendarScreen.jsx`, `calendar2.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| View swap (Day / 3 days / Week / Month) | 240 | `nx-ease` (`both`) | view change | 1 ms | `calendar2.jsx:638` |
| Days grid swap | 240 | `nx-ease` | paging (`key` = range) | 1 ms | `calendar2.jsx:506` |
| Every block enters (`nx-swap`, `both`) | 260 | `nx-ease` | block mount (each render of a range) | — | `styles/tasks.css:122-123` |
| Block hover / move / resize: bg, shadow, transform, left, width | 140 | `ease` | hover, drag preview | — | `styles/tasks.css:123` |
| Drop preview (scaleY .9 → 1) | 140 | `ease` (`both`) | drag over a free slot | none | `CalendarScreen.jsx` (`drop-preview`); `app.css:333-337,353` |
| "+N" slot list / block peek (`nx-pop`) | 180 in / 130 out; `useExit` **120** | `nx-ease` / `ease-in` | click / hover / focus | 1 ms | `calendar2.jsx:368,381` |
| Initial scroll to now (no animation; re-applied for up to 40 frames) | — | — | mount | n/a | `CalendarScreen.jsx:169-175` |
| Drag a task onto a day column (`data-drop="timeline"`, 15-min snap) / a task block inside the grid | see Global (Drag); the card flies into the new block | | | | `calendar2.jsx` `WeekView`, `C2Block` |

### Tasks / Work (`work.jsx`, `task.jsx`, `Dialogs.jsx` task card)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Tab, view or page swap (scroller) | 240 | `nx-ease` | tab / view / page change | 1 ms | `work.jsx:469` |
| Project and member cards; 40 ms stagger | 240 | `nx-ease` | mount | 1 ms | `work.jsx:186-190,215-219` |
| Card hover lift | 150 | `ease` | hover | — | `styles/tasks.css:154,159` |
| Progress rings (stroke-dashoffset) | 400 | `nx-ease` | value change | — | `styles/tasks.css:47,151` |
| Tabs bg / colour | 160 | `ease` | hover / select | (colour only) | `work.jsx:72` |
| Filter "Clear" chip | 240 | `nx-ease` | filter set | 1 ms | `work.jsx:462` |
| New project sheet + scrim | 280 / 220 in, 170 out; `useExit` 170 | `nx-ease` / `ease` | open/close | 1 ms | `work.jsx:133` |
| More menu (`nx-pop`) | 180 / 130; `useExit` 130 | `nx-ease` | open | 1 ms | `work.jsx:240` |
| Touch rows / titles | opacity 200; colour 240 / 280 | `ease` | done / hover | (opacity, colour) | `styles/tasks.css:51,56,87` |
| Task card: scrim fade | 160 | `ease` (`both`) | open | none | `styles/tasks.css:217-218,433` |
| Task card: card scale .98 → 1 (origin 50% 40%) | 160 | `nx-ease` (`both`) | open | none | `styles/tasks.css:219-221,433` |
| Task card: selection bar · chip popovers / ⋯ menu · Scheduling section | 120 · 140 · 160 | `ease` · `nx-ease` · `nx-ease` | select text / open chip / ⋯ → Scheduling | none | `styles/tasks.css:287-288,336-338,361-362,433` |
| Task card check + subtask check (tick + ring) | 320 + 600 | `nx-ease` + `ease-out` | toggle (`is-ticking`) | 1 ms | `styles/tasks.css:428-434` |
| Task card "Saved" | 400 | `ease` | autosave | (opacity) | `styles/tasks.css:357` |
| Task card chips / icon buttons | 120 bg + shadow; press 90 | `ease` | hover / press | none | `styles/tasks.css:229,242,258,435` |

### Project page (`work.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Page enters | 240 | `nx-ease` | open a project | 1 ms | `work.jsx:288` |
| Hero ring (stroke-dashoffset) | 400 | `nx-ease` | progress change | — | `styles/tasks.css:151` |
| Task rows / check | as Tasks / Home | | | | `task.jsx` |

### Docs and the document (`DocsScreen.jsx`, `Brief.jsx`, `RichBlock.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Doc cards; stagger `min(30i, 240)` | 240 | `nx-ease` | list mount / filter | 1 ms | `DocsScreen.jsx:587` |
| Document tab swap / new block / share person row | 240 | `nx-ease` | tab change / block insert / invite | 1 ms | `DocsScreen.jsx:1791,1768,958` |
| Menus: DcPop, DropMenu, Pop, slash menu (`nx-pop`) | 180 / 130; `useExit` 130 | `nx-ease` / `ease-in` | open/close | 1 ms | `DocsScreen.jsx:35,499,794,1636` |
| DcDialog: sheet + scrim | 280 / 220 in, 170 out; `useExit` 170 | `nx-ease` / `ease` | open/close | 1 ms | `DocsScreen.jsx:875` |
| Page backdrop crossfade: new layer in / old layer out | 320 / 320 | `soft-8` (`both`) | backdrop change | in: none; out: — | `DocsScreen.jsx:1752-1753`; `app.css:955-978` |
| Inspector panel width + opacity | 260 | `soft-8` | open/close inspector | — | `styles/docs.css:435` |
| Page max-width; page bg / colour | 260; 400 | `soft-8`; `ease` | width or doc-style change | — | `styles/docs.css:431` |
| Scroller padding; style panel width | 260 | `soft-8` | layout change | — | `styles/docs.css:238,29` |
| Style preview background | 300 | `ease` | style hover / pick | (colour) | `styles/docs.css:308` |
| Gallery card hover (transform, shadow) | 150 | `ease` | hover | — | `styles/docs.css:325` |
| Cover tools / block grip / block tools (opacity) | 160 / 120 / 150 | `ease` | hover | (opacity) | `app.css:964,970`; `styles/docs.css:192` |
| RichBlock counter bump | 320 | `ease` | count changes | none | `RichBlock.jsx`; `app.css:390-400` |
| Brief typewriter | 18 ms per character | step | Brief writes | instant: full text at once | `Brief.jsx:23-28` |
| Brief caret blink | 1 s, steps(1), infinite | — | only while typing | none | `Brief.jsx:33`; `app.css:248-249,274` |
| Selection mark bar (scale .96, origin bottom) | 120 | `ease-pop` | select text | 0.01 ms | `Brief.jsx:350`; `app.css:409` |
| Comment thread (block margin badge → thread, `nx-up`) | 180 in; out none (unmounts) | `nx-ease` | badge click | 1 ms | `DocsScreen.jsx` `DocComments` |
| Selection bar's Mention / Comment panels | none — they appear with the bar's mode | — | @ / speech bubble | — | `DocsScreen.jsx` `SelectionBar` |
| Flame (Docs, Habits, Settings, Chat): body / core / core | 1.25 s × 3 / 0.78 s × 5 / 0.55 s × 7 reverse, then still | ease-in-out | mount | none | `Flame.jsx`; `app.css:362-386` |

### Mailbox (`MailScreen.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| List, message, empty state (`nx-swap`) | 240 | `nx-ease` | mount / open message (`key`) | 1 ms | `MailScreen.jsx:156,217,231` |
| Outlook banner in | 240 | `nx-ease` | shown | 1 ms | `MailScreen.jsx:50` |
| Outlook banner out (opacity; Y −4) | 180; 200, `useExit` 200 | `ease`; `nx-ease` | connected | opacity ok; transform — | `MailScreen.jsx:46`; `styles/mail.css:22-25` |
| Sync spinner | 0.8 s, linear, infinite | — | while syncing | — (spinner, exempt) | `MailScreen.jsx:36` |
| Composer window (New message / Reply / Reply all / Forward / a draft) in: `nx-up` — opacity 0 → 1, Y 6 → 0, scale .97 → 1, origin bottom left | 180 (`--nx-in`) | `nx-ease` | opens | 1 ms | `MailScreen.jsx` `MlComposer` (`.nx-up.ml-co`); `app.css:621,632` |
| Composer window out | none — it unmounts at once (Send, ×, Esc, Save draft, bin); the toast ("Sent to …" / "Saved to Drafts" / "Draft discarded") carries the change | — | close | — | `MailScreen.jsx` |
| Composer: recipient suggestions, From menu (`nx-pop`) | 180 / 130 | `nx-ease` | typing in To / Cc / Bcc; From | 1 ms | `MailScreen.jsx` `MlRecipients` |
| Phone composer: a `PkSheet` (detent 0.94) — rises from the bottom, glass; closes by sliding down | sheet spring (as every `PkSheet`) | — | New / Reply / Reply all / Forward / a draft | plain open / close | `phone-mail.jsx` `PmlComposer` |

### Habits (`Habits.jsx`, `places.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Habits columns; delays 40 / 70 | 240 | `nx-ease` | mount | 1 ms | `places.jsx:212,218` |
| Today cards; 30 ms stagger | 240 | `nx-ease` | mount | 1 ms | `Habits.jsx:151-152` |
| Dot press / fill (transform; bg) | 160; 150 | `ease-out`; `ease` | check-in | — | `styles/habits.css:65` |
| Cells, rows, buttons (bg, shadow; press 90) | 150 | `ease` | hover / press | — | `styles/habits.css:6,10,97,106` |
| Habit sheet (`nx-sheet` + scrim) | 280 / 220, 170 out; `useExit` 170 | `nx-ease` | open/close | 1 ms | `places.jsx:85` |
| Flame | see Docs | | | | |

### Boards / Moodboards (`places.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Pins and cards; stagger 30·i, `min(i,12)`·30–35, 40·i | 240 | `nx-ease` | mount | 1 ms | `places.jsx:273,326,416,914,981,1103,1367` |
| Side panel in (X 24) / out (X 16) | 260 / 180; `useExit` 200 | `nx-ease` / `ease-in` | open/close item | 1 ms | `places.jsx:1037`; `app.css:792-795,812` |
| Card image lift −1 px; hover bar (opacity, Y) | 160; 140 / 160 | `nx-ease`; `ease` / `nx-ease` | hover | lift —; bar none | `app.css:772,781,812` |
| Pinterest import skeleton shimmer; 80 ms stagger | 1.2 s, ease-in-out, infinite | — | while importing | none (stops) | `places.jsx:976`; `app.css:796-798,813` |
| Switch knob | 180 | `nx-ease` | toggle | none | `app.css:802,812` |
| Drop overlay (`nx-sheet-in`) | 240 | `nx-ease` (`both`) | file dragged over | — | `app.css:789-791` |
| Dialog (`nx-sheet`) | 280 / 170; `useExit` 170 | `nx-ease` | open/close | 1 ms | `places.jsx:711` |

### Connections (`connections.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Sky header | PxSky (Global) | | while visible | still frame | `scenes.jsx` |
| Tab track (delay 40); rows (30 ms stagger) | 240 | `nx-ease` | mount / tab | 1 ms (fill `backwards` on glass) | `connections.jsx:1190,865,954`; `connections.css:150-157` |
| Sticky header bg / shadow | 200 | `ease` | scroll past | none | `connections.css:81,92` |
| Glass card hover | 220 | `nx-ease` / `ease` | hover | none | `scenes.jsx:1360-1368,1411` |
| Chips, segments | bg 140–160; press 90 | `ease` | hover / press | — | `connections.jsx:164,176`; `connections.css:142` |
| Provider sheet + scrim | 280 / 220 in, 170 out; `useExit` 170 | `nx-ease` | open/close | 1 ms | `connections.jsx:319` |
| Popovers (`nx-pop`) | 180 / 130; `useExit` 130 | `nx-ease` | open | 1 ms | `connections.jsx:284,659` |
| Connect spinner | 0.8 s, linear, infinite | — | while connecting | slowed to 2 s | `connections.jsx:142-143,225` |

### Settings (`SettingsScreen.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Section enters (Y 6, fill `both`) | 220 | `ease` | section change | none | `SettingsScreen.jsx` (`settings-enter`); `app.css:305-306,351-353` |
| "Saved" pill (in → hold → out) | 1.7 s | `ease` | a setting saved | none | `app.css:307-308,352` |
| Theme tile ring / label | 200 | `ease` | pick | (shadow, colour) | `styles/settings.css:26-28` |
| Theme / accent change | theme crossfade (Global) | | | | |
| Plan promo card: hover lift / press .985; glow | 260 / 90; 280 | `soft-8` | hover / press | none | `styles/settings.css:104-107`; `paywall.jsx:184` |
| Promo sky ("clouds part") | k = 0.16/frame @30 | PxSky | hover / focus-visible | instant | `scenes.jsx:1299-1306` |
| Advanced chevron rotate | 150 | `ease` | fold | — | `styles/settings.css:114` |
| Sheets (`nx-sheet` + scrim) | 280 / 220, 170 | `nx-ease` | open | 1 ms | `SettingsScreen.jsx` (`nx-sheet`) |

### Focus window (`focus.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Scrim in / out | 200 / 180; `useExit` 180 | `ease` / `ease-in` | open/close | (fade) | `focus.jsx:128`; `styles/focus.css:9-10` |
| Window in (Y 10, .97) / out (Y 6, .98) | 300 / 180 | `nx-ease` / `ease-in` | open/close | fade | `styles/focus.css:12-19,27-28` |
| View switch (Setup ↔ Running ↔ Summary) | 260 | `nx-ease` (`backwards`) | view change | fade | `styles/focus.css:24-25,29` |
| Switch knob; track | 160; 160 | `nx-ease`; `ease` | toggle | none | `styles/focus.css:88-89,30` |
| Progress bar fill (scaleX) | 200 | `linear` | each second | none | `styles/focus.css:106,30` |
| Task / segmented rows | 140 / 120 | `ease` | hover / select | none | `styles/focus.css:66,85,113,30` |
| Sky | PxSky, runs only while open | | | still frame | SCREENS.md: Focus |
| Sidebar pill ring / clock / aura | see Sidebar and Shell | | | | |

### Chat / Ask Needt (`Chat.jsx`, `styles/chat.css`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Dock card in (X 18, Y 10, .94) / out | 460 / 200; `useExit` 220 | `chat-spring` / `chat-out` | open/close (wide) | fade 160 | `Chat.jsx:957`; `chat.css:15-16,25-26,302-305` |
| Narrow sheet (X 100% + 16) | 420 / 200 | `chat-spring` / `chat-out` | open/close (narrow) | fade 160 | `chat.css:17-19,27-28` |
| Corner panel (scale .9) | 420 / 180; `useExit` 200 | `chat-spring` / `chat-out` | open/close (corner) | fade 160 | `chat.css:22-24,29-30` |
| Scrim | 200 / 180 | `ease` / `ease-in` | open/close | (fade) | `chat.css:20-21` |
| Greeting / sub (Y 8) | 420, delay 40 / 90 | `nx-ease` | empty chat | fade 160 | `chat.css:89-90` |
| Suggestion cards; delays 120–320 | 380 | `nx-ease` | empty chat | fade 160 | `chat.css:91-98` |
| Suggestion hover / press | bg 140, shadow 160, transform 200; press 90 | `nx-ease` | hover / press | transform none | `chat.css:94,100,308` |
| Message in (Y 8; yours X 10, Y 6, .97) | 300 | `nx-ease` | new message | fade 160 | `chat.css:114-118` |
| Scope / mention chip (.85) | 220 | `chat-spring` | added | fade 160 | `chat.css:129-130` |
| "Thinking" shimmer | 1.4 s, linear, infinite (+ 260 in) | — | only while Needt works | none | `Chat.jsx:875`; `chat.css:150-151,306` |
| Streaming caret | 900 ms, steps(1), infinite | — | only while streaming | none (reply appears whole) | `Chat.jsx:360,1400`; `chat.css:140-141,307` |
| Result card (Y 10, .98); delays 90 / 180 | 360 | `nx-ease` | card arrives | fade 160 | `chat.css:177-179` |
| Result card rows (fade); 60–300 stagger | 260 | `ease` | card arrives | (fade) | `chat.css:180-182` |
| Done badge / action glyph / stop button (.6 → 1) | 300 / 320 / 260 | `chat-spring` | action / stop | fade 160 | `chat.css:169-170,189,284` |
| Follow-up buttons; delay 260 / 320 | 300 | `nx-ease` | reply done | fade 160 | `chat.css:156-157` |
| History rows; 40–120 stagger | 260 | `nx-ease` | open history | fade 160 | `chat.css:253-254` |
| Editing line | 200 | `nx-ease` | edit message | fade 160 | `chat.css:285` |
| Send button | bg 140, transform 200 | `chat-spring` | state change | — | `chat.css:281` |
| Agent-run anchor | opacity 180, transform 240 | `ease`, `nx-ease` | agent run | — | `chat.css:35-38` |
| Chat tip island (Y 8, .94) | 320 / 200; `useExit` 200 | `nx-ease` / `ease-in` | tip shown / dismissed | fade 160 | `Chat.jsx:1238`; `chat.css:316-321,362-364` |
| Tip card hover; glow | 260; 280 | `nx-ease` | hover | none | `chat.css:324,330,365` |
| Scope menu / More menu (`nx-pop`, `nx-up`) | 180 / 130; `useExit` 130 | `nx-ease` | open | 1 ms | `Chat.jsx:939,958` |
| AI orb | see Global (no CSS loop; `chat.css:374` is now redundant) | | mount / hover (one cycle) / `active` | nothing | `AiOrb.jsx` |

### Paywall (`paywall.jsx`, `paywall-sheet.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Scrim | 220 / 170 | `ease` / `ease-in` | `openPaywall` / close | 1 ms | `paywall.jsx:198,202` |
| Sheet (Y 18, .97) | 320 / 170 | `(0.2,0.9,0.24,1)` = `nx-ease` / `ease-in` | open/close | 1 ms | `paywall.jsx:194-195,199,202` |
| Collage prints; delays 60–300 | 520 | `nx-ease` (`both`; `backwards` on the sky) | open | 1 ms | `paywall-sheet.jsx:215-238`; `paywall.jsx:200` |
| Sky + promo | PxSky (Global) | | | still | |
| Plan rows / radio; CTA | 140; 120, press 90 | `ease` | hover / select / press | — | `paywall.jsx:104,111,145` |
| Phone frame (`<Paywall phone>`) | 320 | `soft` | mode change | none | `paywall.jsx:163,202` |
| Promo card (sidebar Pro strip): hover / press; glow; dismiss | 260 / 90; 280; 180 | `soft-8`; `ease-in` | hover / ×  | none (dismiss —) | `paywall.jsx:176-193`; `styles/paywall.css:91` |
| Checkout spinner | 0.8 s, linear, infinite | — | while "checking out" | — (spinner, exempt) | `styles/paywall.css:57-58` |

### Auth and onboarding (desktop, `AuthScreen.jsx`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Screen in (Y 10, fill `both`) | 340 | `soft` | sign in / sign up / reset / onboarding mount | none | `AuthScreen.jsx:279,356,903`; `app.css:313-314,352` |
| Wordmark (44 / 30 px, `mode="breathe"`) | develop 620 + 85/letter; one 5.2 s wave; torch spring 220/26/1 | see Global | mount / hover | static | `AuthScreen.jsx:287,364,911` |
| Step change (X ±18) | 240 | `nx-ease` | Continue / Back | 1 ms | `AuthScreen.jsx:14-17,26,919,929` |
| Step art pins; delays 120 / 220 / 260 / per pin | 240 | `nx-ease` (`backwards` on the sky) | step mount | 1 ms | `AuthScreen.jsx:115,135,140,606,959` |
| First task placed on the timeline (delay 160) | 240 | `nx-ease` | Add task | 1 ms | `AuthScreen.jsx:544` |
| Step-art highlight | 200 | `ease` | step progress | (opacity) | `styles/auth.css:35` |
| Setup 3 "cloud sea": tiles settle from Y −6, rotate .6° to rest, then still | 4.2 / 4.8 / 3.9 / 5.2 s (delays 0 / −1.3 / −2.4 / −0.7 s), **once**, fill backwards | ease-in-out | step mounts | none | `AuthScreen.jsx:787,805`; `styles/auth.css:224-232,248` |
| Tile lands (.9 → 1) | 320 | `nx-ease` | drop on a tile | none | `styles/auth.css:235,237,248` |
| Replaced tile springs back into the sea | 560 | `cubic-bezier(.3, 1.5, .5, 1)` (overshoot) | swap | none | `styles/auth.css:236,238,248` |
| Drag ghost returns home | 240 | `nx-ease` | missed drop | none | `styles/auth.css:243-249` |
| Calendar-connect spinner | 0.8 s, infinite | linear | while connecting | slowed to 2.4 s | `styles/auth.css:83-85` |
| Embedded composer | scrim and sheet animation none; glow as Composer | | | | `styles/auth.css:130-131` |
| Sky | PxSky | | | still | `AuthScreen.jsx:109,821` |

### Command palette (`search.jsx`, ⌘K)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Scrim | 220 / 170 | `ease` / `ease-in` | ⌘K / Esc | 1 ms | `search.jsx:90`; `app.css:633-634` |
| Sheet (Y 14, .965) | 280 / 170; `useExit` 170 | `nx-ease` / `ease-in` | open/close | 1 ms | `app.css:635-636` |
| Result rows; delay `min(16i, 160)` (inline `nx-swap`) | 240 | `nx-ease` (`both`) | results change | 1 ms (`.nx-swap` class) | `search.jsx:178-180` |

### Popovers, menus, sheets, toasts, notifications (shared)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| `nx-pop` / `nx-up` menu (Y ∓6, .97; origin at the trigger corner) | 180 in / 130 out | `nx-ease` / `ease-in` | open/close | 1 ms | `app.css:628-632` |
| `useExit` for these menus | 130 (120 in `ctx.jsx:118`, `calendar2.jsx:368,381`, `Composer.jsx:178`) | | | unmounts at once | `motion.js:14-17` |
| Context menu | 180 / 130; `useExit` 120 | `nx-ease` | right-click | 1 ms | `ctx.jsx:118` |
| RichMenu card; rows (inline `nx-swap`) | 180 / 130; rows 240 (delay 40 + 30i) / 220 (delay 30 + 22i) | `nx-ease` | open | 1 ms (rows are `.nx-swap` class) | `popovers.jsx:127-128,152-153,163` |
| DS Menu / Popover / DatePicker (scale .96) | 120 | `ease-pop` | open (they leave at once) | 0.01 ms | `app.css:55-63,238` |
| DS menu rows cascade (Y −5); delays 10–110 | 200 | `nx-ease` | menu open | none | `app.css:181-190,228` |
| DS Dialog: scrim; panel (.975) | 120; 140 | `ease-pop` | open | 0.01 ms | `Dialogs.jsx`; `app.css:64-67,238` |
| `nx-sheet` + `nx-scrim` | sheet 280 / 170; scrim 220 / 170 | `nx-ease`; `ease` / `ease-in` | open/close | 1 ms | `app.css:633-636` |
| Keyboard sheet: scrim; sheet | 120; 120 | `ease-pop` | `?` / Shortcuts | none | `App.jsx:75-76`; `app.css:463-477` |
| Topbar bell / help popovers (`nx-pop`) | 180 / 130; `useExit` 130 | `nx-ease` | open | 1 ms | `topbar.jsx:206-207` |
| Topbar rows (inline `nx-swap`); stagger 22–60 | 200–300 | `nx-ease` | popover open | 1 ms (`.nx-swap` class) | `topbar.jsx:72,103,115,130,241` |
| Unread dot (scale); segmented thumb | 200; 260 | `nx-ease` | change | — | `topbar.jsx:29,58`; `styles/shell.css:129,131` |
| What's new sheet; rows (delay 80 + 50k) | 280 / 170, `useExit` 170; rows 260 | `nx-ease` | open | sheet 1 ms; rows 1 ms (`.nx-swap` class) | `topbar.jsx:165,185` |
| Toast in (Y 12, .96) / out | 260 / 170; dwell 4200; removed at 180 | `nx-ease` / `ease-in` | `toast()` / timeout / Undo | — | `stores.jsx:296-310`; `app.css:663-666` |
| Notification card in / out | 420 / 220; removed 220 | `(0.2,0.8,0.22,1)` / `chat-out` | `__notify` / dismiss | in: none; out still plays | `Notifications.jsx:40,81`; `app.css:113-131` |
| Notification stack depth (scale `1 − 0.035·d`, opacity) | 340 / 240 | `(0.2,0.8,0.22,1)` / `ease` | stack changes | — | `Notifications.jsx:41`; `app.css:114` |
| Composer sheet (`nx-sheet` + scrim) | 280 / 170; `useExit` 170 | `nx-ease` | ⌘N / Esc | 1 ms | `Composer.jsx:278` |
| Composer menus (`nx-pop`) | 180 / 130; `useExit` 120 | `nx-ease` | chip menu | 1 ms | `Composer.jsx:178` |
| Composer box glow on typing (shadow) | 600; 280 while live | `cubic-bezier(0.16, 1, 0.3, 1)` | text entered | — | `composer.css:24,29` |
| Composer "tube" (`::after`) fade, then breath | 700, then 5.2 s infinite | `(0.16,1,0.3,1)`, then ease-in-out | while the field has text | none | `composer.css:57-76,170` |
| Composer shelf (rows, margin; opacity) | 340; 220 | `(0.2,0.78,0.22,1)`; `ease` | `+` | — | `composer.css:146-153` |
| Chip flight into the line · draft · note | 460 · 260 · 200 | `soft` | parse / draft / note | none | `composer.css:140-145,156,161,169` |
| Dictation bars; 90 ms stagger | 720, infinite | ease-in-out | only while listening | none | `Composer.jsx:408`; `composer.css:164-167,169` |
| Help / Bug sheet | 500 | `cubic-bezier(0.22, 0.68, 0.24, 1)` (`both`) | open | none | `Help.jsx`, `Bug.jsx`; `composer.css:41-46,169` |
| State layer · skeleton · spinner (`states.jsx`) | 160 · 1.4 s linear infinite · 0.8 s infinite | `ease` | state switch / loading | layer —; skeleton none; spinner — | `states.jsx:310,371`; `app.css:1049-1057,1110-1111` |

---

## Phone (Plates — `phone-kit.jsx` / `styles/phone-kit.css`, `mobile-v2-plates.jsx`, `phone-*.jsx`; `mobile.html` is one live phone)

Kit curves: `--pk-ease` = `cubic-bezier(0.2, 0.9, 0.25, 1)`, `--pk-spring` = `cubic-bezier(0.22, 1.25, 0.36, 1)` (a small overshoot, CSS). JS springs reuse menu A's integrator (`nvaStep`: 1/240 s substeps, dt capped at 34 ms) and rubber band (`nvaRubber`). Nothing moves at rest; under `prefers-reduced-motion` the springs jump to their target and the kit's transitions are off (`phone-kit.css` reduced-motion block, plus each screen file's own).

### Kit springs and gestures

| What moves | Dur | Curve / spring | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Sheet (`PkSheet`) y: open to the first detent, between detents, shut | until \|x − target\| < 0.5 px and \|v\| < 8 px/s | spring k = 420, ζ = 0.86 | open / close / release of a drag | jumps | `phone-kit.jsx` `PkSheet` |
| Sheet drag | live, 1:1 downward; upward past the top detent a rubber band (d = 40) | — | drag anywhere on the sheet except fields; in the body only from scroll top | live | `PkSheet` `moveTo` |
| Sheet release | projected y + v·180 ms → nearest detent; a flick > 0.9 px/ms from the lowest detent closes | spring as above, starting at the finger's velocity (±4000 px/s) | finger up | same choice, no motion | `PkSheet` `finish` |
| Sheet scrim (`--pk-scrim-k` = 1 − y / (height + 24)) | follows y | — | with the sheet | follows | `PkSheet` `paint` |
| Sheet footer at a lower detent | follows y (rides up by min(y, lowest-detent offset)); glass of its own while pinned | — | with the sheet | follows | `PkSheet` `paint`, `.pk-sheet-foot.is-pinned` |
| Pull-down plate (`PkPullDown`): clip-path reveal to its height, then translateY past it | until settled (menu A's thresholds, or within 0.5 px and < 30 px/s) | spring k = 380, ζ = 0.8; rubber band past its height d = 70 | pull at scroll top (arms at 96 px; a flick > 0.5 px/ms past 30 px opens) · Cancel / drag up (< height − 60 or flick up) · scrim · Esc | jumps | `PkPullDown` |
| Pull-down body (opacity (shown − 40)/70, Y −14 → 0), hint chip (follows the finger) | follows the plate | — | with the plate | follows | `PkPullDown` `paint` |
| Row swipe (`PkRow`) | live 1:1 to 92 px, then rubber band d = 56 (disallowed side d = 18) | — | horizontal drag (> 8 px, \|dx\| > 1.2·\|dy\|) | live | `PkRow` `shape` |
| Row release: spring back | 500 | `--pk-spring` | short swipe | none | `.pk-row` transition |
| Row release: thrown off the edge (X ±112%) | 200 | `cubic-bezier(0.4, 0.6, 0.6, 1)` | ≥ 92 px, or > 36 px with v > 0.55 px/ms | none | `.pk-rw.is-thrown .pk-row` |
| Reveal behind the row (opacity 0.35 + k·0.65, mark scale 0.6 → 1, armed 1.14) | live; mark 300 | `--pk-spring` | while swiping | none | `.pk-reveal`, `.pk-reveal-mark` |
| Row exit (`usePkExit`): check shows / thrown → the row folds shut (grid rows 1fr → 0, opacity) → commit | hold 360 (check) / 190 (swipe), fold 260 | `--pk-ease` | check / swipe | commits at once | `usePkExit`; `.pk-rw` |
| Check ring fill; press | 200; 320 | `ease`; `--pk-spring` | tap | none | `.pk-check-ring` |
| Rolling number (`PkNumber`): each digit a 0–9 strip | 720 | `--pk-spring` | value changes | none | `.pk-num-strip` |
| Buttons press (scale .97), chips (.95) | 180 | `--pk-ease` | tap | none | `.pk-btn`, `.pk-chip` |
| Section fold chevron | 220 | `--pk-ease` | fold | none | `.pk-sec-chev` |

### Wave 3 (09.10.26): fog drift, composer from the pill, sweeps, drag, sky

| What moves | Dur | Curve / spring | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Fog halftone dots drift like the sky — **owner exception to "nothing loops at rest" (09.10.26)**: each dot layer (48 px wider than the band) slides right → left 48 px (8 cells, seamless) per cycle via `translate`, plus a 1.5 px `transform` bob; compositor-only; the scroll no longer moves them | layers 40 / 31 / 23 s (bob 9 / 11 / 7.5 s), infinite while the band is live | linear (drift), ease-in-out (bob) | none — runs while visible; paused when the tab is hidden, the band is off-screen (`pkFogLive`, IntersectionObserver), a PkScreen fog is faded out (`data-pk-fog-on`) or menu A's card fog is not showing (`data-live`) | static (`animation: none`) | `phone-kit.css` `pk-fog-drift/-bob`, `nav-a.css` `nva-fog-drift/-bob`, `phone-kit.jsx` `pkFogLive` |
| Composer grows out of menu A's pill (`PkSheet from=pkPillRect`): clip-path inset + corner radius from the pill's rect to the sheet; a plate-coloured wash fades as it grows; the pill steps out (`NeedtNavA morph`) | until settled | open: spring k = 170, ζ = 0.84; back into the pill: k = 380, ζ = 1 | + on the pill / close by tap, Esc, Create (a drag closes by sliding) | plain open / close, no morph | `PkSheet` `morph`, `morphPaint` |
| Halftone dot sweep (`PkSweep`, `pkDotSweep`): one band crosses once | 380 | `cubic-bezier(0.3, 0.6, 0.3, 1)` | a screen switch from menu A, a completed row / Next up Done | none | `.pk-sweep-band` |
| Phone drag (`phone-drag.jsx`): long press 350 ms lifts the row itself (scale, plate shadow, tilt); rows and section heads make room; settle into the gap; missed → flies back | lift 200, shift 220, settle 340, flip 320 | `--pk-spring` / `--pk-ease` | long press (moving 7 px first gives the touch back to scroll / swipe) | instant, no tilt | `styles/phone-drag.css` |
| Long press → actions (`PkHold` → `PkActions`) | 450 ms hold; the sheet's spring | as Sheet | hold / right click | the sheet jumps | `PkHold`, `PkActions` |
| Sky (PxSky) on Next up / Calendar plates, menu A's card band, Settings' Pro plate, empty states, the pull-down strip: clouds drift, part under the finger (passive touch) | per frame | `scenes.jsx` rules | on screen and in use (parked off-screen, when covered, after 12 s idle — `pxRest`) | still frame | `scenes.jsx` PxSky; `PkSkyPlate`, `PkSkyBadge` |

### Title collapse and blur bands

| What moves | Range (scrollTop y) | Src |
|---|---|---|
| Top band (`--pk-band`, three backdrop blurs 4 / 10 / 22 px masked further toward the edge + a wash) | 0 → 1 over y 0–24 | `PkScreen` scroll read; `.pk-topband` |
| Large title fades (`--pk-kl`) | over y 6–28 | `.pk-title` |
| Compact title in (`--pk-kt`: opacity, Y 8 → 0); `data-pk-collapsed` at 0.5 | over y 20–44 | `.pk-compact-title` |
| Bottom fog behind the pill (`--pk-fog-k`: blur + halftone dots) | 1 while more than 100 px of content is below; fades over the last 40–100 px | `.pk-fog` |
| Strip edges (`PkChips`: blur 3 / 9 px + wash) | opacity 200 `ease`, only on the side that has more | `.pk-edge` |
| Sheet / pull-down scrim (blur 5 px + 18 px masked to the edges + tint) | `--pk-scrim-k` on the layers, never opacity on a parent of a blur | `.pk-scrim` |

All driven by scroll only (no timers); the reader (`phone-docs.jsx`) and an open board (`phone-habits.jsx`) drive the same vars from their own scroller with `PkTopBand` / `PkFog`.

### Phone screens

| Screen | What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|---|
| Every place | the stage swaps by key (no transition between places) | — | — | menu A | — | `V2pScreens` |
| Home | Next up plate in (Y 10, .985 → 1); progress bar `scaleX` | 420; 500 | `--pk-ease` | new Next up; count changes | none | `mobile-v2-plates.css` `.v2p-next`, `.v2p-prog-fill` |
| Calendar | view / day swap (Y 8 → 0, fade) | 320 | `--pk-ease` | Schedule ⇄ Month, another day | none | `.v2p-swap` |
| Tasks | tab swap (Y 6); header bar; project ring | 300; 600; 600 | `--pk-ease`; `--pk-spring` | tab; count changes | none | `phone-tasks.css` |
| Docs | ⋯ popover in (spring) / out; reader push and edge-swipe back (p 0 → 1, the list behind at −28 %) | 420 / 240; until settled | `--pd-spring` / `--pd-ease`; spring k = 260, ζ = 0.92 | ⋯; open / back (left edge 24 px, release past 0.4 or v > 0.45) | none; jumps | `phone-docs.css:79-80`; `phone-docs.jsx` `PdDocReader` |
| Habits / Moodboards | check-in ring, strip dots, segment; boards as before (`MbmRoot`: push 300, tiles 320 staggered, item `mbm-up`; the share demo's "tap here" ring still loops 1.6 s — see Violations 6) | 200–500 | `--pk-spring` / `nx-ease` | tap | none | `phone-habits.css`; `mobile.css` `mbm-*` |
| Connections · Trash | switch knob; forget / restore press | 320; 180 | `--pk-spring`; `--pk-ease` | toggle; tap | none | `phone-places.css` |
| Task sheet | "Saved" flash (in 80, out 400); fact chevron | 80 / 400; 250 | `ease`; `--pk-ease` | autosave; open a fact | none | `phone-overlays.css:27-28,45` |
| Snack | in (Y 24, .96 → 1) | 420 | `--pk-spring` | say() | none | `phone-overlays.css:126` |
| Paywall | the sheet's spring; the sky inside drifts as `scenes.jsx` rules (idle → still) | — | — | open | still frame | `PkPaywall`; `scenes.jsx` |

### Phone menu A, "Card" (`nav-a.jsx`, `styles/nav-a.css`; host `V2pLivePhone`, counts from `mobile-nav.jsx`)

| What moves | Dur | Curve / spring | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Pill ↔ card ↔ tucked handle (one value p: 0 / 1 / −1); paints opacities, fog, scrim, tiles and rows per frame | until settled (\|x − target\| < 0.0006, \|v\| < 0.004) | spring k = 420, ζ = 0.8 (slightly under-damped); 1/240 s substeps; dt capped at 34 ms | release of a drag / tap the dots / tap the scrim | jumps to the target | `nav-a.jsx:146-155,270-315,325,349` |
| Settings (t) and profile (u) open inside the card | same | spring k = 360, ζ = 0.92 | tap Settings / profile | jump | `nav-a.jsx:326-327,349` |
| Release target | — | projected p + v·0.16 s; thresholds 0.22 / 0.6 / ±0.5 | finger up | same choice, no motion | `nav-a.jsx:461-466` |
| Rubber band past the card / below the pill | live | `(1 − 1/(x·0.55/d + 1))·d`, d = 90 (÷140); below: `−1.22·(1 − e^(−d/150))` | over-drag | live (follows the finger) | `nav-a.jsx:157,597-603` |
| List fling | until v < 0.3 px/frame | v·16 px/frame, × 0.95 per frame | flick a list | no fling | `nav-a.jsx:605-617` |
| Hold to capture: body scale .955 | 480 (long-press 480 opens the composer) | transition 0.48 s | press and hold | transition none | `nav-a.jsx:399`; `nav-a.css:12,146` |
| Body transform | 500 | `cubic-bezier(0.2, 0.9, 0.25, 1)` | mode change | none | `nav-a.css:10,146` |
| Tiles; glyph; rows | bg 200 / transform 180; 180; bg 180 | `ease`; `(0.2,0.9,0.25,1)`; `ease` | press / hover | none | `nav-a.css:27,45,83,93,146` |
| Switch knob; track | 300; 220 | `cubic-bezier(0.3, 1.35, 0.5, 1)` (overshoot); `ease` | toggle | none | `nav-a.css:132-135,146` |
| Lists scroll back to the top | 420 after closing (no animation) | — | pill / hidden | — | `nav-a.jsx:347` |
| Host theme switch buttons | 180 | `ease` | hover | — | `mobile-nav.css` `.mn-theme-btn` |
| Steps aside (`away`: Ask, paywall, a place's cover): body Y 140 | 360 | as body transform | `away` | none | `nav-a.css:15-16` |
| At rest | nothing moves | | | | `nav-a.jsx:19` |

### Phone onboarding (`MobileAuth.jsx`, `styles/mobile-onboarding.css`)

| What moves | Dur | Curve | Trigger | Reduced motion | Src |
|---|---|---|---|---|---|
| Step change (`.mb-step`) | **instant**: no keyframes are defined; only a fill override exists | — | Continue | n/a | `MobileAuth.jsx:136,657,665`; `scenes.jsx:1313-1314` |
| Wordmark; sky | as desktop | | mount / hover | static / still | `MobileAuth.jsx` (3× ExposureWordmark, PxSky) |
| First task placed (delay 160) | 240 | `nx-ease` | Add | 1 ms | `MobileAuth.jsx:287` |
| Calendar-connect spinner | 0.8 s | linear | connecting | 2.4 s | `MobileAuth.jsx:350` |
| Composer tube loop | 5.2 s infinite | ease-in-out | while text | none | `MobileAuth.jsx:372` |
| Menu setup: pill shakes (X −6 / +5 / −3 / +2) | 360 | `cubic-bezier(0.36, 0.07, 0.19, 0.97)` | tapping a place while the pill is full | none | `MobileAuth.jsx:503,549`; `mobile-onboarding.css:21-28,74` |
| Slots shift; lifted slot instant | 180 (shadow 140) | `nx-ease` | reorder / drag | none | `mobile-onboarding.css:32-34,75` |
| Chip lands (.6 → 1) | 320 | `cubic-bezier(0.2, 0.9, 0.24, 1.2)` (overshoot) | drop | none | `MobileAuth.jsx:563`; `mobile-onboarding.css:41-42,74` |
| Tiles | bg 140, shadow 160, transform 140; press 90 | `nx-ease` | hover / press | none | `mobile-onboarding.css:59-60,75` |

---

## Violations

Marked **Fixed (08.10.26)** where the loops / reduced-motion pass closed them (desktop + shared code; phone files, `nav-a.*` and `scenes.jsx` were out of scope). Verified with Playwright `document.getAnimations()` after 3 s idle, with and without `reducedMotion: 'reduce'`.

### A. Loops at rest

1. **Phone AI orb loops forever.** `styles/base.css:87-88` gives the orb a 9 s turn and a 7 s breathe, both infinite. Only `styles/chat.css:374` switches them off, and `mobile-dev.html` / `mobile-nav.html` do not load `chat.css`. On the phone the orb therefore loops at rest where it appears (08.10.26: only the Ask sheet — the header orb and More are archived).
   **Fixed (08.10.26):** the CSS loops are gone from `styles/base.css:87-91` (shared), so the orb is a still frame everywhere; `AiOrb.jsx` plays the turn/breathe by WAAPI only while `active`, and for one cycle on hover/focus.
2. **Composer "tube" breath.** `composer.css:76` runs `needt-co-glow` 5.2 s infinite for as long as the field holds text. Text sitting in an idle field is rest. This hits onboarding (`MobileAuth.jsx:372`); the live phone's composer is now `PkComposer` (no tube, 08.10.26) and the old `MbComposer` is archived. (Correction: the desktop Composer does not render `.co-box`; only the phone files do.)
   **Fixed (08.10.26):** `composer.css:78` plays one breath when `is-live` is first set, then the glow holds still.
3. **Focus session loops.** The sidebar pill ring (`app.css:289`, 6 s infinite) and the room aura (`app.css:286`, 6 s infinite) run for the whole session with no input. The clock arc (`shell.css:89`) and bar (`focus.css:106`) also tween every second.
   **Fixed (08.10.26):** aura and ring take one 6 s breath when the session starts (or resumes), then hold the rest frame (`app.css:287,290`). The arc and bar tweens stay: they are state-driven progress, one short tween per tick.
4. **PxSky drifts continuously** at 20/30 fps whenever it is visible (`scenes.jsx:1132-1146`). PORT §5.5 sanctions this; `rules.md` ("nothing loops at rest") does not. The owner needs to decide which rule wins. The night-mood star twinkle is also continuous (`:1044`).
   **Fixed (08.10.26, owner: "if it doesn't cost much, make it lighter at rest"):** after 12 s with no input the drift (and the star twinkle, which runs on the same eased clock) eases to 0 over 1.5 s and the sky stops scheduling frames; input eases it back over 0.8 s with no jump (`scenes.jsx:286-319,1185-1213`). Small skies drift at 24 fps instead of 30. While the page is in use the sky still drifts (PORT §5.5).
5. **Onboarding cloud-sea tiles bob** (4–5 s infinite, `auth.css:224-227`) at rest for up to 10 s after each interaction before `.is-idle` pauses them (`AuthScreen.jsx:806`).
   **Fixed (08.10.26):** one settle (Y −6 → 0) on mount, then still (`auth.css:225,232`); the idle timer and visibility watch were removed from `AuthScreen.jsx`.
6. **Boards share demo:** the "tap here" ring `mbm-ring` loops 1.6 s infinite while it waits for a tap (`mobile.css:649`, `Mobile.jsx:2909`). Open (phone, out of scope).
7. **Animations that play on mount, not on an event.** Any `[aria-checked=true]` or `[data-state=checked]` element plays the tick and ring on every mount (`app.css:210`). `tasks.css:427-428` cancels this only for the task checks. DS chips and status dots "land" on every mount (`app.css:200`). Open (finite, not a loop).

### B. Fill `both` on broad selectors (entry animations hold state)

8. Fill `both` holds the end state. It is used by `.screen-enter` (`app.css:69`, the whole screen wrapper), `.nx-swap` and `.sb-tile` (`app.css:637,659`), `.tk-block` (every calendar block, `tasks.css:123`), `.settings-enter`, `.auth-enter` and `.sb-swap` (`app.css:306,314,926`), `.mbm-tile` (`mobile.css:646`) and the inline `nx-swap` rows (popovers, search, topbar, sidebar-kit). Only the sky scope is patched, at `scenes.jsx:1377-1380` and `connections.css:150-157`.

### C. Missing reduced motion

9. **Inline `animation: nx-swap …` styles** bypass the `.nx-swap` reduced-motion rule: `popovers.jsx:128,153`, `search.jsx:180`, `sidebar-kit.jsx:93`, `topbar.jsx:72,104,116,130,185,248`.
   **Fixed (08.10.26):** the rows now use the `.nx-swap` class (only a non-default duration and the stagger delay stay inline), so the `.nx-swap` reduced-motion rule applies; the global rule covers them as well.
10. **Classes that reuse nx keyframes without the nx class:** `.sb-tile` (`app.css:659`), `.tk-block` (`tasks.css:123`), `.nx-toast` (`app.css:665`, missing from the list at `:647`), `.mb-drop` (`app.css:791`), `.focus-exit` (`app.css:660`).
    **Fixed (08.10.26):** covered by the global rule (`styles/base.css:116-133`).
11. **`.mb-skel` shimmer** gets `animation-duration: 1ms` while remaining `infinite` (`app.css:812`): it keeps cycling at 1 ms instead of stopping. Use `animation: none`.
    **Fixed (08.10.26):** `app.css:813` sets `.mb-skel { animation: none !important }`; the global rule also forces one iteration.
12. **Layout and transform transitions with no reduced-motion rule:**
    - sidebar collapse (`app.css:654-657`)
    - rail and chat column (inline, `App.jsx:558,606`)
    - floating sidebar (`App.jsx:547`)
    - Docs inspector, page, padding and style panel (`docs.css:29,238,431,435`)
    - Mailbox banner (`mail.css:24`)
    - calendar block left / width / transform (`tasks.css:123`)
    - progress rings (`tasks.css:47,151`)
    - Home load bar (`home.css:208`)
    - card hover lifts (`home.css:141`, `tasks.css:154,159`, `docs.css:325`, `app.css:772`)
    - segmented thumb and unread dot (`shell.css:129,131`)
    - Customize FLIP (`sidebar-kit.jsx:124-125`)
    - Composer shelf and glow (`composer.css:24,146-151`)
    - notification stack transform and exit (`app.css:114,128`: `.nf-card.is-out` outranks the reduced-motion `.nf-card` rule)
    - Docs backdrop out (`app.css:977`)
    - chat agent anchor and send button (`chat.css:35-38,281`)
    - habit dot (`habits.css:65`)

    **Fixed (08.10.26):** all of these, inline ones included, are 1 ms under the global rule (`styles/base.css:116-133`, `!important`, so `.nf-card.is-out` no longer outranks it).
13. **Global press scale** (`button:active`, `app.css:172`) stays on under reduced motion. The reduced-motion block at `app.css:226-232` only cancels hover transforms.
    **Partly fixed (08.10.26):** the press transition is 1 ms under the global rule, so the scale is instant; the 0.97 press scale itself still applies.
14. **JS motion ignores reduced motion:** the agent cursor flight (`AgentCursor.jsx`), the drag ghost spring and lean (`Drag.jsx:165-202`) and the Brief typewriter (`Brief.jsx:27`).
    **Fixed (08.10.26):** the cursor is placed at each target (`AgentCursor.jsx:55,115`); the drag ghost is pinned to the pointer with no lean, and a missed drop removes it at once (`Drag.jsx:166-208`); the Brief text appears whole (`Brief.jsx:23-28`). Already handled: wordmark spring (`ExposureWordmark.jsx:121`, `live` is false when calm), Time theme crossfade (`Drift.jsx:256-259`); other theme crossfades are CSS transitions and fall under the global rule.
15. **Phone:**
    - MbSheet slide and scrim (`mobile.css:179-180`)
    - composer lift (`:187`)
    - tab bar and FAB (`:461-462,425`)
    - toggle knob (`:213`)
    - fold chevrons (`:34,265`)
    - press (`:623,650`)

    `mobile.css` has reduced-motion rules only at `:635,654,691`.

    Not edited (phone out of scope). Note that `mobile-dev.html` and `mobile-nav.html` load `styles/base.css`, so the global rule now makes all of these 1 ms there too (not verified on the phone).
16. **`useExit` waits the full exit time under reduced motion.** It waits 130–220 ms (`motion.js:16`) even though the animation is 1 ms, so a closed surface lingers invisible. The Home and phone check timers (600/870, 480/700) also run unchanged.
    **Partly fixed (08.10.26):** `useExit` unmounts at once under reduced motion (`motion.js:14-17`). The Home and phone check timers are unchanged (open).

### D. Off-scale durations and curves (scale: 90·120·130·140·150·170·180·220·240·250·260·280)

17. **Off-scale values in common use:**
    - **160** (`.nx-press`, `.mb-card`, focus switch, `tdc-*`, chat hover)
    - **200** (sidebar swap, chat scrim, Focus scrim, mail banner, toggles)
    - **300–360** (chat messages, `needt-tick`, `needt-land`, `mbm-*`, auth-enter 340, Focus window 300, paywall sheet 320, Docs backdrop 320)
    - **380–460** (chat cards and springs, `needt-rise` 460, notifications 420, Composer flight 460)
    - **500–620** (Help / Bug 500, `nav-a` body 500, collage 520, progress fills 520, onboarding return 560, wordmark develop 620)
    - long tails: Time theme 1.2 s / 1.5 s, saved pill 1.7 s, AI orb mount 1.4 s, Flame bursts
18. **Exits that do not match their `useExit` time:** `calendar2.jsx:368,381`, `ctx.jsx:118` and `Composer.jsx:178` unmount at 120 ms while the `nx-pop` exit runs 130 ms, so the last 10 ms is cut. In `places.jsx:1037` (200 vs `mb-side-out` 180) and `MailScreen.jsx:46` (200 vs 180/200) the surface lingers after its exit.
19. **Duplicate curves:**
    - `nx-ease` vs `ease-pop`: same intent, different third value (0.24 vs 0.3).
    - Near-duplicates of `nx-ease`: `(0.2,0.7,0.2,1)`, `(0.2,0.8,0.2,1)`, `(0.2,0.8,0.22,1)`, `(0.2,0.78,0.22,1)`, `(0.2,0.8,0.24,1)`, `(0.2,0.9,0.25,1)`, `(0.22,0.68,0.24,1)`.
    - Overshoot curves against the motion pass's "no bounce past 1" (`app.css:616`): `chat-spring` (1.28), onboarding return (1.5), nav-a knob (1.35), phone chip land (1.2), `needt-land` / `needt-tick` / `nx-tick` / `hd-spring` keyframe overshoots.
    - `needt-land` and `needt-tab-fill` use `filter: blur`, against "no blur" (same comment).
20. **Dead motion CSS** (keyframes and classes not referenced by mounted JSX): `needt-breathe`, `needt-lean`, `needt-mark-puff` and the `.needt-mark` wordmark loop; `needt-dot`; `needt-island-*`; `needt-veil-*`; `needt-step-*`; `needt-aurora`; `needt-mini-*`; `.hd-wall`; `needt-co-discharge`; `.ew-leans` (`ExposureWordmark.jsx:355` sets `animation: none` on it). Do not port these.
