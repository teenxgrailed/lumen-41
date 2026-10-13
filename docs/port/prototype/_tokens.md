# Colour tokens (code-review item 9)

All tokens below were added to `themes.css` (section "COLOUR TOKENS", end of file). Values are copied 1:1 from the JSX literals, so replacing a literal with its token is visually a no-op. `_hex-map.json` lists every literal in the live files (scripts mounted by index.html / mobile.html) with its replacement.

## How to replace

- `replacement: "var(--x)"` - put it where the literal was (inline style string, CSS text inside a `<style>` string, `setProperty` value, gradient stop).
- `replacement: "cssVar('--x')"` - the value is consumed by JS (canvas `fillStyle`/`addColorStop`, SVG inside a `data:` URI, or parsed as hex by `dtRgb`/`dcLum`/`dcHex`/`pxHex`/`hexRgb`/`mbHex`). Add this helper once (e.g. top of `Data.js`, exported on `window`) and replace the string literal with the call (no quotes):

```js
/* Resolved value of a colour token, e.g. cssVar("--sky-clear-top") -> "#94bde2".
   Reads :root, where every fixed token lives; pass an element for a scoped one. */
const _cssVarCache = {};
function cssVar(name, el) {
  if (!el && _cssVarCache[name]) return _cssVarCache[name];
  const v = getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  if (!el && v) _cssVarCache[name] = v;
  return v;
}
window.cssVar = cssVar;
```

  Module-level palettes (`DT_THEMES`, `PX_MOOD_HEX`, Drift `PALETTES`, `DC_PAGES`) run at script load; themes.css is a `<link>` in `<head>`, so `:root` is already styled when Babel runs the scripts. All cssVar tokens are fixed (no .dark value), so caching is safe.
- `replacement: "transparent"` - fully transparent gradient stop (CSS gradients interpolate premultiplied, identical render).
- `replacement: null` with `category: "keep-content"` - user / seed content colours (moodboard items, swatch presets, sample tiles). They are stored, parsed as hex and displayed as hex text: data, not styling. Leave them.
- `category: "not-a-colour"` - placeholder text / message / order number that only looks like hex. Leave it.
- Entries with a `note` need a small code change besides the swap (drop a fallback, delete a now-identical `.dark` rule, replace the `t.bg === "#ffffff"` test in connections.jsx with a flag).
- `.dark` / `.dim` rules in paywall.jsx and scenes.jsx whose literals map to theme-following tokens (`--badge-strong-*`, `--button-inverse-*`, `--status-success-*`, `--sky-*` default scope) become duplicates of the light rule and can be deleted after the swap.
- One intended dark-mode change: sidebar-kit.jsx:109 white ink on `var(--accent)` -> `var(--accent-contrast)` (white on the light dark-mode accents is ~2:1).

## Literal counts by category (876 literals in 19 files)

| category | count | meaning |
|---|---|---|
| c-palette-doc | 226 | doc theme / page / text / backdrop palette |
| alpha-ladder | 138 | white/black/ink/smoke alpha ladder |
| c-palette-sky | 115 | sky moods and sky ink sets |
| keep-content | 89 | user/seed content colour, kept |
| c-illustration | 84 | drawn art and mock UI |
| b-semantic | 56 | new semantic token (role) |
| c-brand | 51 | third-party brand marks |
| c-palette-time | 33 | Time theme (Drift) palette |
| c-illustration-ios | 33 | iPhone frame / iOS demo |
| c-palette-hue | 28 | project / person / event hues |
| keyword | 6 | -> transparent |
| b-overlay | 4 | new scrim token |
| b-status | 4 | new status token |
| not-a-colour | 3 | not a colour, kept |
| a-existing | 3 | maps to an existing DS/theme token |
| b-mask | 3 | mask stop -> --color-black |

Theme-following tokens: light value on `:root, .paper, .warm`, dark value on `.dark` (the `--button-inverse-*` trio also on `.dim`, matching the old paywall rules).

## Tokens added (472; 16 follow the theme)

### base

BASE - the two absolutes. Only where something must stay pure white/black in both themes (switch knob, canvas ground, mask stop).

| token | light | dark | purpose |
|---|---|---|---|
| `--color-white` | `#ffffff` | - | pure white (knobs, canvas grounds, mock surfaces that stay white) |
| `--color-black` | `#000000` | - | pure black (masks, mock device ground) |

### semantic

SEMANTIC - roles. Inverse controls and the strong badge follow the theme (.dark block below); the rest are deliberately fixed.

| token | light | dark | purpose |
|---|---|---|---|
| `--badge-strong-bg` | `#1a1c1e` | `#f2f2f5` | solid high-contrast pill (paywall "Best value") |
| `--badge-strong-fg` | `#ffffff` | `#141418` | ink on --badge-strong-bg |
| `--button-inverse-bg` | `#1a1c1e` | `#ffffff` | inverse primary button ground (paywall CTA) |
| `--button-inverse-bg-hover` | `#34373b` | `#e4e4e6` | inverse primary button ground, hover |
| `--button-inverse-fg` | `#ffffff` | `#111214` | ink on --button-inverse-bg |
| `--text-on-fill` | `#ffffff` | - | ink on a saturated fill (success, project hue, brand tile, danger badge); stays white in both themes |
| `--ink-fixed` | `#1a1c1e` | - | near-black ink on surfaces that stay light in both themes (illustrations, mock cards, light sky) |
| `--kbd-fill` | `rgba(127, 127, 127, 0.28)` | - | keyboard-shortcut chip ground (theme-neutral grey) |
| `--swatch-label-dark` | `rgba(0, 0, 0, 0.78)` | - | label ink on a light user swatch (mobile moodboard) |
| `--swatch-label-dark-2` | `rgba(0, 0, 0, 0.82)` | - | label ink on a light user swatch (desktop moodboard) |
| `--swatch-label-light` | `rgba(255, 255, 255, 0.92)` | - | label ink on a dark user swatch |
| `--swatch-fallback` | `#cccccc` | - | grey used when a typed swatch colour cannot be parsed (must stay hex: parsed) |
| `--badge-dark-bg` | `#111111` | - | solid near-black pill on the sky (.px-badge), both themes |

### status

STATUS - follow the theme (.dark block below). Text pairs checked >= 4.5:1 (light 4.61, dark 7.87).

| token | light | dark | purpose |
|---|---|---|---|
| `--status-success-fg` | `#1c7a3e` | `#8fe0aa` | success badge ink (>=4.5:1 on its bg in both themes) |
| `--status-success-bg` | `#dcf3e3` | `rgba(60, 170, 100, 0.18)` | success badge ground |

### overlay

OVERLAYS - scrims.

| token | light | dark | purpose |
|---|---|---|---|
| `--overlay-scrim-sheet` | `rgba(0, 0, 0, 0.4)` | - | scrim behind mobile bottom sheets |
| `--paywall-scrim` | `rgba(8, 8, 8, 0.46)` | - | scrim behind the paywall |

### alpha

ALPHA LADDERS - white / black / fixed ink / dark-glass graphite at an alpha. For shadows, glass and highlights inside code that already branches on the theme (a .dark rule or a `dark ?` ternary). Name = colour + alpha percent (a7_5 = 7.5%).

| token | light | dark | purpose |
|---|---|---|---|
| `--black-a45` | `rgba(0, 0, 0, 0.45)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a30` | `rgba(0, 0, 0, 0.3)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a55` | `rgba(255, 255, 255, 0.55)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a0` | `rgba(255, 255, 255, 0)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a40` | `rgba(255, 255, 255, 0.4)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a70` | `rgba(255, 255, 255, 0.7)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a6` | `rgba(0, 0, 0, 0.06)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-a55` | `rgba(30, 32, 36, 0.55)` | - | dark glass graphite rgb(30,32,36) at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a8` | `rgba(255, 255, 255, 0.08)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a10` | `rgba(255, 255, 255, 0.1)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a95` | `rgba(255, 255, 255, 0.95)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a14` | `rgba(0, 0, 0, 0.14)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a8` | `rgba(0, 0, 0, 0.08)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a18` | `rgba(255, 255, 255, 0.18)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a60` | `rgba(255, 255, 255, 0.6)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a35` | `rgba(0, 0, 0, 0.35)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a6` | `rgba(255, 255, 255, 0.06)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a4` | `rgba(0, 0, 0, 0.04)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a10` | `rgba(0, 0, 0, 0.1)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a14` | `rgba(255, 255, 255, 0.14)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a20` | `rgba(0, 0, 0, 0.2)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a7` | `rgba(0, 0, 0, 0.07)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a50` | `rgba(255, 255, 255, 0.5)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a15` | `rgba(255, 255, 255, 0.15)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a18` | `rgba(0, 0, 0, 0.18)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a12` | `rgba(0, 0, 0, 0.12)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a25` | `rgba(0, 0, 0, 0.25)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a22` | `rgba(255, 255, 255, 0.22)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a85` | `rgba(255, 255, 255, 0.85)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a7_5` | `rgba(0, 0, 0, 0.075)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a9` | `rgba(0, 0, 0, 0.09)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a1_8` | `rgba(0, 0, 0, 0.018)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a1_2` | `rgba(0, 0, 0, 0.012)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a25` | `rgba(255, 255, 255, 0.25)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a45` | `rgba(255, 255, 255, 0.45)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a80` | `rgba(255, 255, 255, 0.8)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-a0` | `rgba(30, 32, 36, 0)` | - | dark glass graphite rgb(30,32,36) at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-a85` | `rgba(30, 32, 36, 0.85)` | - | dark glass graphite rgb(30,32,36) at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a19` | `rgba(0, 0, 0, 0.19)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a72` | `rgba(255, 255, 255, 0.72)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-a70` | `rgba(30, 32, 36, 0.7)` | - | dark glass graphite rgb(30,32,36) at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--black-a50` | `rgba(0, 0, 0, 0.5)` | - | black at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a30` | `rgba(255, 255, 255, 0.3)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-a40` | `rgba(30, 32, 36, 0.4)` | - | dark glass graphite rgb(30,32,36) at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-a60` | `rgba(30, 32, 36, 0.6)` | - | dark glass graphite rgb(30,32,36) at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a16` | `rgba(255, 255, 255, 0.16)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a35` | `rgba(255, 255, 255, 0.35)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--white-a78` | `rgba(255, 255, 255, 0.78)` | - | white at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-hi-a75` | `rgba(46, 48, 54, 0.75)` | - | dark glass hover graphite rgb(46,48,54) at an alpha (shadows, glass, scrims inside already theme-conditional code) |
| `--smoke-a45` | `rgba(30, 32, 36, 0.45)` | - | dark glass graphite rgb(30,32,36) at an alpha (shadows, glass, scrims inside already theme-conditional code) |

### brand

BRAND - third-party marks and monogram tiles (connections, source chips, iOS demo icons). Never theme-shifted: a logo is a logo.

| token | light | dark | purpose |
|---|---|---|---|
| `--brand-figma-blue` | `#1abcfe` | - | Figma logo colour |
| `--brand-figma-green` | `#0acf83` | - | Figma logo colour |
| `--brand-figma-coral` | `#ff7262` | - | Figma logo colour |
| `--brand-figma-red` | `#f24e1e` | - | Figma logo colour |
| `--brand-figma-purple` | `#a259ff` | - | Figma logo colour |
| `--brand-pinterest` | `#e60023` | - | Pinterest red |
| `--brand-slack` | `#611f69` | - | Slack source hue (RichBlock source chips) |
| `--brand-google` | `#4285f4` | - | Google source hue (RichBlock source chips) |
| `--brand-apple` | `#8e8e93` | - | Apple source hue (RichBlock source chips) |
| `--brand-linear` | `#5e6ad2` | - | Linear source hue (RichBlock source chips) |
| `--brand-ios-messages` | `#34c759` | - | iOS Messages icon |
| `--brand-ios-mail` | `#1e88ff` | - | iOS Mail icon |
| `--brand-needt-tile` | `#16161a` | - | Needt app-icon tile |
| `--brand-ios-notes` | `#ffcc00` | - | iOS Notes icon |
| `--brand-gmail-bg` | `#ffffff` | - | gmail monogram tile ground |
| `--brand-gmail-fg` | `#d6402f` | - | gmail monogram tile glyph |
| `--brand-outlook-bg` | `#1b6ec2` | - | outlook monogram tile ground |
| `--brand-outlook-fg` | `#ffffff` | - | outlook monogram tile glyph |
| `--brand-gcal-bg` | `#ffffff` | - | gcal monogram tile ground |
| `--brand-gcal-fg` | `#2f62c9` | - | gcal monogram tile glyph |
| `--brand-gcal-band` | `#4a80e8` | - | gcal monogram tile band |
| `--brand-ical-bg` | `#ffffff` | - | ical monogram tile ground |
| `--brand-ical-fg` | `#1a1c1e` | - | ical monogram tile glyph |
| `--brand-ical-band` | `#f0473c` | - | ical monogram tile band |
| `--brand-gdrive-1` | `#22a565` | - | gdrive tile gradient stop 1 |
| `--brand-gdrive-2` | `#f2c230` | - | gdrive tile gradient stop 2 |
| `--brand-gdrive-3` | `#3b7de9` | - | gdrive tile gradient stop 3 |
| `--brand-gdrive-fg` | `#ffffff` | - | gdrive monogram tile glyph |
| `--brand-figma-bg` | `#1e1e1e` | - | figma monogram tile ground |
| `--brand-figma-fg` | `#ffffff` | - | figma monogram tile glyph |
| `--brand-pinterest-bg` | `#e60023` | - | pinterest monogram tile ground |
| `--brand-pinterest-fg` | `#ffffff` | - | pinterest monogram tile glyph |
| `--brand-claude-bg` | `#c96f4a` | - | claude monogram tile ground |
| `--brand-claude-fg` | `#ffffff` | - | claude monogram tile glyph |
| `--brand-chatgpt-bg` | `#111214` | - | chatgpt monogram tile ground |
| `--brand-chatgpt-fg` | `#ffffff` | - | chatgpt monogram tile glyph |
| `--brand-cursor-bg` | `#17181b` | - | cursor monogram tile ground |
| `--brand-cursor-fg` | `#ffffff` | - | cursor monogram tile glyph |
| `--brand-gemini-1` | `#3d7bf0` | - | gemini tile gradient stop 1 |
| `--brand-gemini-2` | `#8a63e6` | - | gemini tile gradient stop 2 |
| `--brand-gemini-3` | `#d36ad0` | - | gemini tile gradient stop 3 |
| `--brand-gemini-fg` | `#ffffff` | - | gemini monogram tile glyph |
| `--brand-perplexity-bg` | `#1d5f5c` | - | perplexity monogram tile ground |
| `--brand-perplexity-fg` | `#e6fbf8` | - | perplexity monogram tile glyph |

### palette/hue

PALETTE / HUE - project, person and moodboard hues; calendar-event hues in demos.

| token | light | dark | purpose |
|---|---|---|---|
| `--hue-orange` | `#ff7a45` | - | project / person / moodboard hue (orange) |
| `--hue-blue` | `#4c8dff` | - | project / person / moodboard hue (blue) |
| `--hue-violet` | `#b072ff` | - | project / person / moodboard hue (violet) |
| `--hue-green` | `#2fd08a` | - | project / person / moodboard hue (green) |
| `--hue-yellow` | `#ffc53d` | - | project / person / moodboard hue (yellow) |
| `--hue-pink` | `#ff5c8a` | - | project / person / moodboard hue (pink) |
| `--demo-hue-orange` | `#ff8a3d` | - | calendar-event hue in onboarding / paywall demos |
| `--demo-hue-green` | `#2f9e62` | - | calendar-event hue in onboarding / paywall demos |
| `--demo-hue-gray` | `#8a8d93` | - | calendar-event hue in onboarding / paywall demos |

### palette/doc

PALETTE / DOC - document themes (DT_THEMES: cv1-5 swatch, amb-l/-d tint, page/ink/head per side), page colours (DC_PAGES), text hues (DC_TEXTS), marble ramps, backdrop veils. JS parses these as hex: read them with cssVar(), never var().

| token | light | dark | purpose |
|---|---|---|---|
| `--doc-theme-default-cv1` | `#e3e9f0` | - | doc theme "default": cover/swatch colour 1 |
| `--doc-theme-default-cv2` | `#cdd7e4` | - | doc theme "default": cover/swatch colour 2 |
| `--doc-theme-default-cv3` | `#9fb3cc` | - | doc theme "default": cover/swatch colour 3 |
| `--doc-theme-default-cv4` | `#ffffff` | - | doc theme "default": cover/swatch colour 4 |
| `--doc-theme-default-cv5` | `#7d93b2` | - | doc theme "default": cover/swatch colour 5 |
| `--doc-theme-paper-cv1` | `#f1eadb` | - | doc theme "paper": cover/swatch colour 1 |
| `--doc-theme-paper-cv2` | `#e4d8c0` | - | doc theme "paper": cover/swatch colour 2 |
| `--doc-theme-paper-cv3` | `#c8b48e` | - | doc theme "paper": cover/swatch colour 3 |
| `--doc-theme-paper-cv4` | `#faf6ee` | - | doc theme "paper": cover/swatch colour 4 |
| `--doc-theme-paper-cv5` | `#a8916a` | - | doc theme "paper": cover/swatch colour 5 |
| `--doc-theme-paper-amb-l` | `#a08a64` | - | doc theme "paper": ambient tint (light) |
| `--doc-theme-paper-amb-d` | `#8a7655` | - | doc theme "paper": ambient tint (dark) |
| `--doc-theme-paper-page-l` | `#faf7f0` | - | doc theme "paper": page on the light side |
| `--doc-theme-paper-ink-l` | `#2a2620` | - | doc theme "paper": ink on the light side |
| `--doc-theme-paper-head-l` | `#6b4a22` | - | doc theme "paper": head on the light side |
| `--doc-theme-paper-page-d` | `#2a2722` | - | doc theme "paper": page on the dark side |
| `--doc-theme-paper-ink-d` | `#ece6da` | - | doc theme "paper": ink on the dark side |
| `--doc-theme-paper-head-d` | `#dcc198` | - | doc theme "paper": head on the dark side |
| `--doc-theme-ink-cv1` | `#1d2733` | - | doc theme "ink": cover/swatch colour 1 |
| `--doc-theme-ink-cv2` | `#2c3e55` | - | doc theme "ink": cover/swatch colour 2 |
| `--doc-theme-ink-cv3` | `#5b86b8` | - | doc theme "ink": cover/swatch colour 3 |
| `--doc-theme-ink-cv4` | `#9cc3ff` | - | doc theme "ink": cover/swatch colour 4 |
| `--doc-theme-ink-cv5` | `#e8eef6` | - | doc theme "ink": cover/swatch colour 5 |
| `--doc-theme-ink-amb-l` | `#2c3a4a` | - | doc theme "ink": ambient tint (light) |
| `--doc-theme-ink-amb-d` | `#3a4d66` | - | doc theme "ink": ambient tint (dark) |
| `--doc-theme-ink-page-l` | `#1e2126` | - | doc theme "ink": page on the light side |
| `--doc-theme-ink-ink-l` | `#e8eaed` | - | doc theme "ink": ink on the light side |
| `--doc-theme-ink-head-l` | `#9cc3ff` | - | doc theme "ink": head on the light side |
| `--doc-theme-ink-page-d` | `#1a1c20` | - | doc theme "ink": page on the dark side |
| `--doc-theme-ink-ink-d` | `#e8eaed` | - | doc theme "ink": ink on the dark side |
| `--doc-theme-ink-head-d` | `#9cc3ff` | - | doc theme "ink": head on the dark side |
| `--doc-theme-rose-cv1` | `#c8352b` | - | doc theme "rose": cover/swatch colour 1 |
| `--doc-theme-rose-cv2` | `#e0574a` | - | doc theme "rose": cover/swatch colour 2 |
| `--doc-theme-rose-cv3` | `#f6b49a` | - | doc theme "rose": cover/swatch colour 3 |
| `--doc-theme-rose-cv4` | `#7a2a22` | - | doc theme "rose": cover/swatch colour 4 |
| `--doc-theme-rose-cv5` | `#ffe0cf` | - | doc theme "rose": cover/swatch colour 5 |
| `--doc-theme-rose-amb-l` | `#7a4030` | - | doc theme "rose": ambient tint (light) |
| `--doc-theme-rose-amb-d` | `#8a4535` | - | doc theme "rose": ambient tint (dark) |
| `--doc-theme-rose-page-l` | `#fffaf7` | - | doc theme "rose": page on the light side |
| `--doc-theme-rose-ink-l` | `#33211d` | - | doc theme "rose": ink on the light side |
| `--doc-theme-rose-head-l` | `#b02a20` | - | doc theme "rose": head on the light side |
| `--doc-theme-rose-page-d` | `#2d2321` | - | doc theme "rose": page on the dark side |
| `--doc-theme-rose-ink-d` | `#f2e4df` | - | doc theme "rose": ink on the dark side |
| `--doc-theme-rose-head-d` | `#ff998c` | - | doc theme "rose": head on the dark side |
| `--doc-theme-sage-cv1` | `#dbe6d2` | - | doc theme "sage": cover/swatch colour 1 |
| `--doc-theme-sage-cv2` | `#a8c19a` | - | doc theme "sage": cover/swatch colour 2 |
| `--doc-theme-sage-cv3` | `#6f9563` | - | doc theme "sage": cover/swatch colour 3 |
| `--doc-theme-sage-cv4` | `#f1f5ec` | - | doc theme "sage": cover/swatch colour 4 |
| `--doc-theme-sage-cv5` | `#4d7344` | - | doc theme "sage": cover/swatch colour 5 |
| `--doc-theme-sage-amb-l` | `#5f7f52` | - | doc theme "sage": ambient tint (light) |
| `--doc-theme-sage-amb-d` | `#5f7f52` | - | doc theme "sage": ambient tint (dark) |
| `--doc-theme-sage-page-l` | `#f7f9f3` | - | doc theme "sage": page on the light side |
| `--doc-theme-sage-ink-l` | `#20291e` | - | doc theme "sage": ink on the light side |
| `--doc-theme-sage-head-l` | `#3b6634` | - | doc theme "sage": head on the light side |
| `--doc-theme-sage-page-d` | `#232a22` | - | doc theme "sage": page on the dark side |
| `--doc-theme-sage-ink-d` | `#e3eadf` | - | doc theme "sage": ink on the dark side |
| `--doc-theme-sage-head-d` | `#a9d49c` | - | doc theme "sage": head on the dark side |
| `--doc-theme-ocean-cv1` | `#d6eaf5` | - | doc theme "ocean": cover/swatch colour 1 |
| `--doc-theme-ocean-cv2` | `#8cc1e0` | - | doc theme "ocean": cover/swatch colour 2 |
| `--doc-theme-ocean-cv3` | `#3b86b8` | - | doc theme "ocean": cover/swatch colour 3 |
| `--doc-theme-ocean-cv4` | `#f2f8fc` | - | doc theme "ocean": cover/swatch colour 4 |
| `--doc-theme-ocean-cv5` | `#1d5f8f` | - | doc theme "ocean": cover/swatch colour 5 |
| `--doc-theme-ocean-amb-l` | `#2f78a6` | - | doc theme "ocean": ambient tint (light) |
| `--doc-theme-ocean-amb-d` | `#2f6f9a` | - | doc theme "ocean": ambient tint (dark) |
| `--doc-theme-ocean-page-l` | `#f5f9fc` | - | doc theme "ocean": page on the light side |
| `--doc-theme-ocean-ink-l` | `#18242f` | - | doc theme "ocean": ink on the light side |
| `--doc-theme-ocean-head-l` | `#1a5d8c` | - | doc theme "ocean": head on the light side |
| `--doc-theme-ocean-page-d` | `#1e252c` | - | doc theme "ocean": page on the dark side |
| `--doc-theme-ocean-ink-d` | `#e2ecf3` | - | doc theme "ocean": ink on the dark side |
| `--doc-theme-ocean-head-d` | `#8dc7ef` | - | doc theme "ocean": head on the dark side |
| `--doc-theme-sand-cv1` | `#f6e6c3` | - | doc theme "sand": cover/swatch colour 1 |
| `--doc-theme-sand-cv2` | `#e8c27e` | - | doc theme "sand": cover/swatch colour 2 |
| `--doc-theme-sand-cv3` | `#c98f3a` | - | doc theme "sand": cover/swatch colour 3 |
| `--doc-theme-sand-cv4` | `#fdf5e4` | - | doc theme "sand": cover/swatch colour 4 |
| `--doc-theme-sand-cv5` | `#9c6420` | - | doc theme "sand": cover/swatch colour 5 |
| `--doc-theme-sand-amb-l` | `#c08a3c` | - | doc theme "sand": ambient tint (light) |
| `--doc-theme-sand-amb-d` | `#a87a35` | - | doc theme "sand": ambient tint (dark) |
| `--doc-theme-sand-page-l` | `#fdf8ee` | - | doc theme "sand": page on the light side |
| `--doc-theme-sand-ink-l` | `#2e2516` | - | doc theme "sand": ink on the light side |
| `--doc-theme-sand-head-l` | `#8a560f` | - | doc theme "sand": head on the light side |
| `--doc-theme-sand-page-d` | `#2c261c` | - | doc theme "sand": page on the dark side |
| `--doc-theme-sand-ink-d` | `#f1e7d4` | - | doc theme "sand": ink on the dark side |
| `--doc-theme-sand-head-d` | `#efc47c` | - | doc theme "sand": head on the dark side |
| `--doc-theme-night-cv1` | `#151832` | - | doc theme "night": cover/swatch colour 1 |
| `--doc-theme-night-cv2` | `#2a2560` | - | doc theme "night": cover/swatch colour 2 |
| `--doc-theme-night-cv3` | `#7a6ad8` | - | doc theme "night": cover/swatch colour 3 |
| `--doc-theme-night-cv4` | `#e9e4ff` | - | doc theme "night": cover/swatch colour 4 |
| `--doc-theme-night-cv5` | `#c7b8ff` | - | doc theme "night": cover/swatch colour 5 |
| `--doc-theme-night-amb-l` | `#2a2550` | - | doc theme "night": ambient tint (light) |
| `--doc-theme-night-amb-d` | `#3a3270` | - | doc theme "night": ambient tint (dark) |
| `--doc-theme-night-page-l` | `#17171f` | - | doc theme "night": page on the light side |
| `--doc-theme-night-ink-l` | `#e9e7f2` | - | doc theme "night": ink on the light side |
| `--doc-theme-night-head-l` | `#c3b5ff` | - | doc theme "night": head on the light side |
| `--doc-theme-night-page-d` | `#15151c` | - | doc theme "night": page on the dark side |
| `--doc-theme-night-ink-d` | `#e9e7f2` | - | doc theme "night": ink on the dark side |
| `--doc-theme-night-head-d` | `#c3b5ff` | - | doc theme "night": head on the dark side |
| `--doc-page-white-l` | `#ffffff` | - | doc page colour "white" (l) |
| `--doc-page-white-d` | `#2c2c2e` | - | doc page colour "white" (d) |
| `--doc-page-paper-l` | `#faf6ee` | - | doc page colour "paper" (l) |
| `--doc-page-paper-d` | `#2d2a25` | - | doc page colour "paper" (d) |
| `--doc-page-paper-amb-l` | `#a08a64` | - | doc page colour "paper" (amb-l) |
| `--doc-page-paper-amb-d` | `#8a7655` | - | doc page colour "paper" (amb-d) |
| `--doc-page-rose-l` | `#fdf1ef` | - | doc page colour "rose" (l) |
| `--doc-page-rose-d` | `#352a2b` | - | doc page colour "rose" (d) |
| `--doc-page-rose-amb-l` | `#c0605a` | - | doc page colour "rose" (amb-l) |
| `--doc-page-rose-amb-d` | `#8a4535` | - | doc page colour "rose" (amb-d) |
| `--doc-page-lilac-l` | `#f5f1fd` | - | doc page colour "lilac" (l) |
| `--doc-page-lilac-d` | `#2b283a` | - | doc page colour "lilac" (d) |
| `--doc-page-lilac-amb-l` | `#7a64c8` | - | doc page colour "lilac" (amb-l) |
| `--doc-page-lilac-amb-d` | `#5a4a9a` | - | doc page colour "lilac" (amb-d) |
| `--doc-page-sage-l` | `#f1f6ec` | - | doc page colour "sage" (l) |
| `--doc-page-sage-d` | `#262d25` | - | doc page colour "sage" (d) |
| `--doc-page-sage-amb-l` | `#5f7f52` | - | doc page colour "sage" (amb-l) |
| `--doc-page-sage-amb-d` | `#5f7f52` | - | doc page colour "sage" (amb-d) |
| `--doc-page-sky-l` | `#eef5fb` | - | doc page colour "sky" (l) |
| `--doc-page-sky-d` | `#222b34` | - | doc page colour "sky" (d) |
| `--doc-page-sky-amb-l` | `#2f78a6` | - | doc page colour "sky" (amb-l) |
| `--doc-page-sky-amb-d` | `#2f6f9a` | - | doc page colour "sky" (amb-d) |
| `--doc-page-sand-l` | `#fbf3e3` | - | doc page colour "sand" (l) |
| `--doc-page-sand-d` | `#302a1f` | - | doc page colour "sand" (d) |
| `--doc-page-sand-amb-l` | `#c08a3c` | - | doc page colour "sand" (amb-l) |
| `--doc-page-sand-amb-d` | `#a87a35` | - | doc page colour "sand" (amb-d) |
| `--doc-page-graphite-l` | `#2f3135` | - | doc page colour "graphite" (l) |
| `--doc-page-graphite-d` | `#38393d` | - | doc page colour "graphite" (d) |
| `--doc-page-black-l` | `#161618` | - | doc page colour "black" (l) |
| `--doc-page-black-d` | `#131315` | - | doc page colour "black" (d) |
| `--doc-ink-dark` | `#1c1d20` | - | doc auto text ink (dark) |
| `--doc-ink-light` | `#f2f1ee` | - | doc auto text ink (light) |
| `--doc-text-umber-dk` | `#4a321c` | - | doc text hue "umber", deep reading |
| `--doc-text-umber-lt` | `#efd6b4` | - | doc text hue "umber", pale reading |
| `--doc-text-wine-dk` | `#7a1f2e` | - | doc text hue "wine", deep reading |
| `--doc-text-wine-lt` | `#f6c1c8` | - | doc text hue "wine", pale reading |
| `--doc-text-plum-dk` | `#4d2a6e` | - | doc text hue "plum", deep reading |
| `--doc-text-plum-lt` | `#dcc8f6` | - | doc text hue "plum", pale reading |
| `--doc-text-navy-dk` | `#173a63` | - | doc text hue "navy", deep reading |
| `--doc-text-navy-lt` | `#b9d6f5` | - | doc text hue "navy", pale reading |
| `--doc-text-forest-dk` | `#21492b` | - | doc text hue "forest", deep reading |
| `--doc-text-forest-lt` | `#bfe2c0` | - | doc text hue "forest", pale reading |
| `--doc-marble-ink-1` | `#06080e` | - | marble backdrop "ink" ramp stop 1 (canvas) |
| `--doc-marble-ink-2` | `#101a2c` | - | marble backdrop "ink" ramp stop 2 (canvas) |
| `--doc-marble-ink-3` | `#22385a` | - | marble backdrop "ink" ramp stop 3 (canvas) |
| `--doc-marble-ink-4` | `#0c1322` | - | marble backdrop "ink" ramp stop 4 (canvas) |
| `--doc-marble-ink-5` | `#1d3150` | - | marble backdrop "ink" ramp stop 5 (canvas) |
| `--doc-marble-ink-6` | `#3a5f86` | - | marble backdrop "ink" ramp stop 6 (canvas) |
| `--doc-marble-sparkle-1` | `#e9dff6` | - | marble backdrop "sparkle" ramp stop 1 (canvas) |
| `--doc-marble-sparkle-2` | `#f8dbe8` | - | marble backdrop "sparkle" ramp stop 2 (canvas) |
| `--doc-marble-sparkle-3` | `#e0e6f9` | - | marble backdrop "sparkle" ramp stop 3 (canvas) |
| `--doc-marble-sparkle-4` | `#fbeadf` | - | marble backdrop "sparkle" ramp stop 4 (canvas) |
| `--doc-marble-sparkle-5` | `#eadcf5` | - | marble backdrop "sparkle" ramp stop 5 (canvas) |
| `--doc-marble-sparkle-6` | `#d7e6f6` | - | marble backdrop "sparkle" ramp stop 6 (canvas) |
| `--doc-marble-ink-vein` | `#d8c08c` | - | marble "ink" vein colour (canvas) |
| `--doc-marble-sparkle-vein` | `#ffffff` | - | marble "sparkle" vein colour (canvas) |
| `--doc-marble-fallback` | `#d9d6e8` | - | backdrop shown when canvas is unavailable |
| `--doc-backdrop-dim` | `rgba(14, 14, 16, 0.44)` | - | veil laid over a backdrop on the dark side |
| `--doc-backdrop-dim-sparkle` | `rgba(16, 14, 22, 0.36)` | - | veil laid over a backdrop on the dark side |
| `--doc-backdrop-dim-ink` | `rgba(0, 0, 0, 0.18)` | - | veil laid over a backdrop on the dark side |

### palette/sky

PALETTE / SKY - sky moods (PX_MOOD_HEX: top/mid/low/sun/lit/shade/dot/ridge), the default .px-sky scope (follows the theme), ink sets for light/dark skies, the blue brand sky. Canvas code reads them with cssVar().

| token | light | dark | purpose |
|---|---|---|---|
| `--sky-ground` | `#b5d0e9` | `#162031` | default sky ground before a mood is applied |
| `--sky-ink` | `#1a1c1e` | `#ffffff` | ink on the default sky |
| `--sky-ink-2` | `rgba(26, 28, 30, 0.82)` | `rgba(255, 255, 255, 0.92)` | secondary ink on the default sky |
| `--sky-ink-3` | `rgba(26, 28, 30, 0.76)` | `rgba(255, 255, 255, 0.84)` | tertiary ink on the default sky |
| `--sky-halo` | `rgba(255, 255, 255, 0.3)` | `rgba(0, 0, 0, 0.4)` | text halo on the default sky |
| `--sky-shadow` | `rgba(255, 255, 255, 0)` | `rgba(0, 0, 0, 0.45)` | text shadow on the default sky |
| `--sky-chip` | `rgba(255, 255, 255, 0.3)` | `rgba(30, 32, 36, 0.45)` | chip ground on the sky |
| `--sky-chip-hover` | `rgba(255, 255, 255, 0.5)` | `rgba(46, 48, 54, 0.6)` | chip ground on the sky, hover |
| `--sky-chip-ink` | `#1a1c1e` | `#f2f2f5` | chip ink on the sky |
| `--sky-line` | `rgba(26, 28, 30, 0.16)` | - | hairline on the light sky (also inherited on dark) |
| `--sky-tint` | `#a2c4e4` | - | default sky tint |
| `--sky-hue` | `#b5d0e9` | - | default sky hue |
| `--sky-on-dark-ink` | `#ffffff` | - | ink over a dark sky mood |
| `--sky-on-dark-ink-2` | `rgba(255, 255, 255, 0.92)` | - | sky on dark ink 2 |
| `--sky-on-dark-ink-3` | `rgba(255, 255, 255, 0.84)` | - | sky on dark ink 3 |
| `--sky-on-dark-halo` | `rgba(0, 0, 0, 0.4)` | - | sky on dark halo |
| `--sky-on-dark-shadow` | `rgba(0, 0, 0, 0.45)` | - | sky on dark shadow |
| `--sky-on-dark-line` | `rgba(255, 255, 255, 0.3)` | - | sky on dark line |
| `--sky-on-light-ink` | `#1a1c1e` | - | sky on light ink (ink set over a light sky mood) |
| `--sky-on-light-ink-2` | `rgba(26, 28, 30, 0.82)` | - | sky on light ink 2 (ink set over a light sky mood) |
| `--sky-on-light-ink-3` | `rgba(26, 28, 30, 0.76)` | - | sky on light ink 3 (ink set over a light sky mood) |
| `--sky-on-light-halo` | `rgba(255, 255, 255, 0.3)` | - | sky on light halo (ink set over a light sky mood) |
| `--sky-on-light-shadow` | `rgba(255, 255, 255, 0)` | - | sky on light shadow (ink set over a light sky mood) |
| `--sky-on-light-line` | `rgba(26, 28, 30, 0.16)` | - | sky on light line (ink set over a light sky mood) |
| `--sky-brand-top` | `#1d5cd3` | - | blue brand sky, top |
| `--sky-brand-mid` | `#4a8ce6` | - | blue brand sky, middle (paywall ground fallback) |
| `--sky-brand-low` | `#bfe0f6` | - | blue brand sky, horizon |
| `--paywall-tint` | `#a38ae8` | - | paywall calendar header tint fallback |
| `--sky-clear-top` | `#94bde2` | - | sky mood "clear": top |
| `--sky-clear-mid` | `#b5d0e9` | - | sky mood "clear": mid |
| `--sky-clear-low` | `#dde8f1` | - | sky mood "clear": low |
| `--sky-clear-sun` | `#f8fbff` | - | sky mood "clear": sun |
| `--sky-clear-lit` | `#ffffff` | - | sky mood "clear": lit |
| `--sky-clear-shade` | `#b4c4d6` | - | sky mood "clear": shade |
| `--sky-clear-dot` | `#ffffff` | - | sky mood "clear": dot |
| `--sky-clear-ridge` | `#9db1c6` | - | sky mood "clear": ridge |
| `--sky-haze-top` | `#a4bdd4` | - | sky mood "haze": top |
| `--sky-haze-mid` | `#c1d2e1` | - | sky mood "haze": mid |
| `--sky-haze-low` | `#e5ebf0` | - | sky mood "haze": low |
| `--sky-haze-sun` | `#ffffff` | - | sky mood "haze": sun |
| `--sky-haze-lit` | `#fbfcfd` | - | sky mood "haze": lit |
| `--sky-haze-shade` | `#b9c4d1` | - | sky mood "haze": shade |
| `--sky-haze-dot` | `#ffffff` | - | sky mood "haze": dot |
| `--sky-haze-ridge` | `#a7b5c3` | - | sky mood "haze": ridge |
| `--sky-lilac-top` | `#a6b3d9` | - | sky mood "lilac": top |
| `--sky-lilac-mid` | `#c3c6e3` | - | sky mood "lilac": mid |
| `--sky-lilac-low` | `#e8e2ec` | - | sky mood "lilac": low |
| `--sky-lilac-sun` | `#fff8fc` | - | sky mood "lilac": sun |
| `--sky-lilac-lit` | `#fdfbff` | - | sky mood "lilac": lit |
| `--sky-lilac-shade` | `#bfbad3` | - | sky mood "lilac": shade |
| `--sky-lilac-dot` | `#fdfaff` | - | sky mood "lilac": dot |
| `--sky-lilac-ridge` | `#aeabc6` | - | sky mood "lilac": ridge |
| `--sky-golden-top` | `#9cb9d7` | - | sky mood "golden": top |
| `--sky-golden-mid` | `#c3cfdc` | - | sky mood "golden": mid |
| `--sky-golden-low` | `#ede2cf` | - | sky mood "golden": low |
| `--sky-golden-sun` | `#fff0d4` | - | sky mood "golden": sun |
| `--sky-golden-lit` | `#fffaf1` | - | sky mood "golden": lit |
| `--sky-golden-shade` | `#c9c1bd` | - | sky mood "golden": shade |
| `--sky-golden-dot` | `#fffaf2` | - | sky mood "golden": dot |
| `--sky-golden-ridge` | `#b4b1ae` | - | sky mood "golden": ridge |
| `--sky-silver-top` | `#a0afbf` | - | sky mood "silver": top |
| `--sky-silver-mid` | `#bcc7d2` | - | sky mood "silver": mid |
| `--sky-silver-low` | `#e0e4e8` | - | sky mood "silver": low |
| `--sky-silver-sun` | `#ffffff` | - | sky mood "silver": sun |
| `--sky-silver-lit` | `#f6f8fa` | - | sky mood "silver": lit |
| `--sky-silver-shade` | `#a9b3be` | - | sky mood "silver": shade |
| `--sky-silver-dot` | `#f8fafc` | - | sky mood "silver": dot |
| `--sky-silver-ridge` | `#a1abb6` | - | sky mood "silver": ridge |
| `--sky-night-top` | `#0c121d` | - | sky mood "night": top |
| `--sky-night-mid` | `#162031` | - | sky mood "night": mid |
| `--sky-night-low` | `#253248` | - | sky mood "night": low |
| `--sky-night-sun` | `#8ea2c2` | - | sky mood "night": sun |
| `--sky-night-lit` | `#66758d` | - | sky mood "night": lit |
| `--sky-night-shade` | `#232d3f` | - | sky mood "night": shade |
| `--sky-night-dot` | `#8696ae` | - | sky mood "night": dot |
| `--sky-night-ridge` | `#1a2334` | - | sky mood "night": ridge |
| `--sky-slate-top` | `#0f1319` | - | sky mood "slate": top |
| `--sky-slate-mid` | `#1b222c` | - | sky mood "slate": mid |
| `--sky-slate-low` | `#2c3542` | - | sky mood "slate": low |
| `--sky-slate-sun` | `#9aa6b6` | - | sky mood "slate": sun |
| `--sky-slate-lit` | `#636c7a` | - | sky mood "slate": lit |
| `--sky-slate-shade` | `#262d38` | - | sky mood "slate": shade |
| `--sky-slate-dot` | `#7f8896` | - | sky mood "slate": dot |
| `--sky-slate-ridge` | `#1c222b` | - | sky mood "slate": ridge |
| `--sky-harbor-top` | `#0b1220` | - | sky mood "harbor": top |
| `--sky-harbor-mid` | `#18223b` | - | sky mood "harbor": mid |
| `--sky-harbor-low` | `#2d3853` | - | sky mood "harbor": low |
| `--sky-harbor-sun` | `#a3add0` | - | sky mood "harbor": sun |
| `--sky-harbor-lit` | `#6c7797` | - | sky mood "harbor": lit |
| `--sky-harbor-shade` | `#262e47` | - | sky mood "harbor": shade |
| `--sky-harbor-dot` | `#8590ad` | - | sky mood "harbor": dot |
| `--sky-harbor-ridge` | `#1b2239` | - | sky mood "harbor": ridge |

### palette/time

PALETTE / TIME - Drift readings (bg/raised/ink per phase; JS interpolates them, so cssVar()) and the Settings > Time strip.

| token | light | dark | purpose |
|---|---|---|---|
| `--time-strip-1` | `#cddbff` | - | Settings > Time preview strip stop |
| `--time-strip-2` | `#f4f7ff` | - | Settings > Time preview strip stop |
| `--time-strip-4` | `#ffd49a` | - | Settings > Time preview strip stop |
| `--time-strip-5` | `#f3b9c8` | - | Settings > Time preview strip stop |
| `--drift-day-bg` | `#fcfdfe` | - | Time theme reading "day": bg |
| `--drift-day-raised` | `#ffffff` | - | Time theme reading "day": raised |
| `--drift-day-ink` | `#1a1c1e` | - | Time theme reading "day": ink |
| `--drift-dawn-bg` | `#edf2f9` | - | Time theme reading "dawn": bg |
| `--drift-dawn-raised` | `#f8fafd` | - | Time theme reading "dawn": raised |
| `--drift-dawn-ink` | `#181e28` | - | Time theme reading "dawn": ink |
| `--drift-golden-bg` | `#fbf1e2` | - | Time theme reading "golden": bg |
| `--drift-golden-raised` | `#fffaf1` | - | Time theme reading "golden": raised |
| `--drift-golden-ink` | `#281f16` | - | Time theme reading "golden": ink |
| `--drift-dusk-bg` | `#efe5ec` | - | Time theme reading "dusk": bg |
| `--drift-dusk-raised` | `#f9f2f6` | - | Time theme reading "dusk": raised |
| `--drift-dusk-ink` | `#241c2a` | - | Time theme reading "dusk": ink |
| `--drift-dusk-dark-bg` | `#25222b` | - | Time theme reading "dusk-dark": bg |
| `--drift-dusk-dark-raised` | `#312d38` | - | Time theme reading "dusk-dark": raised |
| `--drift-dusk-dark-ink` | `#eeebf2` | - | Time theme reading "dusk-dark": ink |
| `--drift-dawn-dark-bg` | `#1f242b` | - | Time theme reading "dawn-dark": bg |
| `--drift-dawn-dark-raised` | `#2a3038` | - | Time theme reading "dawn-dark": raised |
| `--drift-dawn-dark-ink` | `#ebeef3` | - | Time theme reading "dawn-dark": ink |
| `--drift-night-bg` | `#202022` | - | Time theme reading "night": bg |
| `--drift-night-raised` | `#2c2c2e` | - | Time theme reading "night": raised |
| `--drift-night-ink` | `#ececec` | - | Time theme reading "night": ink |

### illustration

ILLUSTRATION - drawn art: doc backdrop SVGs (inside data: URIs, so cssVar()), mist/grid gradients, paywall mock cards and art, extension mock, agent cursor.

| token | light | dark | purpose |
|---|---|---|---|
| `--cursor-ink` | `#111111` | - | agent cursor arrow body |
| `--doc-art-dunes-1` | `#f8dcc0` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-2` | `#f4ae8a` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-3` | `#e5826c` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-4` | `#fff2dc` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-5` | `#ffe7cb` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-6` | `#e9937a` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-7` | `#cf6a54` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-8` | `#a94d40` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-dunes-9` | `#7e3934` | - | Dunes backdrop SVG fill (inside a data: URI - needs a resolved value) |
| `--doc-art-sage-1` | `#eef3e6` | - | Sage backdrop SVG fill (data: URI) |
| `--doc-art-sage-2` | `#d3e2c6` | - | Sage backdrop SVG fill (data: URI) |
| `--doc-art-sage-3` | `#f7f5df` | - | Sage backdrop SVG fill (data: URI) |
| `--doc-art-sage-4` | `#bed3ad` | - | Sage backdrop SVG fill (data: URI) |
| `--doc-art-sage-5` | `#9dbb8b` | - | Sage backdrop SVG fill (data: URI) |
| `--doc-art-sage-6` | `#79a06b` | - | Sage backdrop SVG fill (data: URI) |
| `--doc-art-sage-7` | `#5a8250` | - | Sage backdrop SVG fill (data: URI) |
| `--doc-art-ocean-1` | `#e4f1f8` | - | Ocean backdrop SVG fill (data: URI) |
| `--doc-art-ocean-2` | `#b6d7ec` | - | Ocean backdrop SVG fill (data: URI) |
| `--doc-art-ocean-3` | `#f6fbff` | - | Ocean backdrop SVG fill (data: URI) |
| `--doc-art-ocean-4` | `#9fcbe6` | - | Ocean backdrop SVG fill (data: URI) |
| `--doc-art-ocean-5` | `#6eaad3` | - | Ocean backdrop SVG fill (data: URI) |
| `--doc-art-ocean-6` | `#3f88bb` | - | Ocean backdrop SVG fill (data: URI) |
| `--doc-art-ocean-7` | `#1f5f8e` | - | Ocean backdrop SVG fill (data: URI) |
| `--doc-art-mist-l-1` | `#f7d6e6` | - | Mist backdrop radial-gradient colour (light side) |
| `--doc-art-mist-l-2` | `#d3e1fb` | - | Mist backdrop radial-gradient colour (light side) |
| `--doc-art-mist-l-3` | `#e4d8f8` | - | Mist backdrop radial-gradient colour (light side) |
| `--doc-art-mist-l-4` | `#f4f0f7` | - | Mist backdrop radial-gradient colour (light side) |
| `--doc-art-mist-d-1` | `#4a2f40` | - | Mist backdrop radial-gradient colour (dark side) |
| `--doc-art-mist-d-2` | `#2a3a5c` | - | Mist backdrop radial-gradient colour (dark side) |
| `--doc-art-mist-d-3` | `#3b2f57` | - | Mist backdrop radial-gradient colour (dark side) |
| `--doc-art-mist-d-4` | `#1d1c24` | - | Mist backdrop radial-gradient colour (dark side) |
| `--doc-art-grid-dot-l` | `rgba(90, 72, 40, 0.26)` | - | Grid backdrop dot (light side) |
| `--doc-art-grid-ground-l` | `#f3eee3` | - | Grid backdrop ground (light side) |
| `--doc-art-grid-dot-d` | `rgba(255, 255, 255, 0.13)` | - | Grid backdrop dot (dark side) |
| `--doc-art-grid-ground-d` | `#1d1c1a` | - | Grid backdrop ground (dark side) |
| `--mock-shadow-a12` | `rgba(40, 28, 90, 0.12)` | - | violet-tinted shadow under paywall mock cards |
| `--mock-shadow-a10` | `rgba(40, 28, 90, 0.1)` | - | violet-tinted shadow under paywall mock cards |
| `--mock-chip-bg` | `#f0eee9` | - | paywall mock task chip ground |
| `--mock-chip-fg` | `#55524c` | - | paywall mock task chip / time ink |
| `--mock-done-ink` | `#8a877f` | - | paywall mock done-task ink |
| `--mock-habit-off` | `#e6e3dc` | - | paywall mock habit day, off |
| `--mock-streak-bg` | `#e6f4ec` | - | paywall mock streak chip ground |
| `--mock-streak-fg` | `#1f6b42` | - | paywall mock streak chip ink |
| `--mock-event-bg` | `#ffe9d6` | - | paywall mock calendar event ground |
| `--mock-event-fg` | `#7a3a12` | - | paywall mock calendar event ink |
| `--paywall-art-1` | `#ffc79e` | - | paywall photo-tile art |
| `--paywall-art-2` | `#e0785a` | - | paywall photo-tile art |
| `--paywall-art-3` | `#6a3a5e` | - | paywall photo-tile art |
| `--paywall-art-4` | `#b8b3d8` | - | paywall photo-tile art |
| `--paywall-art-5` | `#6c6896` | - | paywall photo-tile art |
| `--paywall-art-6` | `#f6eee0` | - | paywall photo-tile art |
| `--paywall-art-7` | `#d6c2a4` | - | paywall photo-tile art |
| `--mock-shadow-a30` | `rgba(40, 28, 90, 0.3)` | - | violet-tinted shadow under paywall mock cards |
| `--mock-ext-art-1` | `#3a3833` | - | browser-extension mock image placeholder gradient |
| `--mock-ext-art-2` | `#1b1b1d` | - | browser-extension mock image placeholder gradient |
| `--mock-ext-art-3` | `#cfc6b8` | - | browser-extension mock image placeholder gradient |
| `--mock-ext-art-4` | `#8f877a` | - | browser-extension mock image placeholder gradient |

### illustration/ios

ILLUSTRATION / iOS - the iPhone frame, keyboard and share-sheet demo (Apple system colours; the frame branches on its own `dark` prop, so these are fixed).

| token | light | dark | purpose |
|---|---|---|---|
| `--mock-web-page` | `#f4f2ee` | - | share-sheet demo: web page ground |
| `--mock-web-ink` | `#1a1a1a` | - | share-sheet demo: web page ink |
| `--mock-web-muted` | `#777777` | - | share-sheet demo: web page muted ink |
| `--mock-ios-control` | `rgba(30, 30, 32, 0.82)` | - | share-sheet demo: dark iOS control ground |
| `--ios-fill-dark` | `rgba(120, 120, 128, 0.28)` | - | iOS dark tertiary fill |
| `--ios-muted` | `#404040` | - | iOS status/muted glyph (light) |
| `--ios-secondary-label-dark` | `rgba(235, 235, 245, 0.6)` | - | iOS secondary label, dark |
| `--ios-secondary-label` | `rgba(60, 60, 67, 0.6)` | - | iOS secondary label |
| `--ios-tertiary-label-dark` | `rgba(235, 235, 245, 0.3)` | - | iOS tertiary label, dark |
| `--ios-tertiary-label` | `rgba(60, 60, 67, 0.3)` | - | iOS tertiary label |
| `--ios-separator-dark` | `rgba(84, 84, 88, 0.65)` | - | iOS separator, dark |
| `--ios-separator` | `rgba(60, 60, 67, 0.12)` | - | iOS separator |
| `--ios-cell-dark` | `#1c1c1e` | - | iOS grouped cell, dark |
| `--ios-grouped-bg` | `#f2f2f7` | - | iOS grouped background |
| `--ios-key-glyph` | `#595959` | - | iOS keyboard glyph |
| `--ios-key-suggestion` | `#333333` | - | iOS keyboard suggestion ink |
| `--ios-blue` | `#0088ff` | - | iOS keyboard return key |
| `--ios-fill-dark-2` | `rgba(120, 120, 128, 0.14)` | - | iOS dark quaternary fill |
| `--ios-key-divider` | `#cccccc` | - | iOS suggestion divider |
