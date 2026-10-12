# Tokens — naming

`tokens.json` is the W3C Design Tokens (DTCG) form of every theme-level CSS custom property the
prototype declares (DS bundle `tokens/*.css` + `themes.css` + `app.css` + `styles/*.css`).
Generated — never edit; run `node port/tools/extract-tokens.js`.

**Path = `<group>.<css name without -->`.** `--text-primary` → `ink.text-primary`,
`--pdc2-c-red` → `component.pdc2.pdc2-c-red`. The CSS name is kept whole inside the path, so the
mapping is reversible without a table; it is also in `$extensions["app.needt"].css`.

| Group | What | Rule (on the CSS name) |
| --- | --- | --- |
| `color` | fixed palette: `--color-*`, `--white-a*` / `--black-a*` alphas, `--hue-*`, `--brand-*`, status, swatches, mock | `color- white- black- brand- hue- swatch- status- success info destructive ring- mock-` |
| `surface` | grounds and fills: background, `--surface-*`, `--fill-1…6`, border, canvas veil | `background surface- fill- border canvas- page- overlay- scrollbar-` |
| `ink` | text ladder (`--text-primary … --text-disabled`, alpha 100/85/70/55/40/25), `--foreground(-rgb)` | `text-` (non-size) `foreground ink- on-` |
| `accent` | `--accent`, `-rgb`, `-gradient`, `-fill`, `-contrast`, `--fill-accent*`, `--ring-accent`; `accent.preset.<id>` lists the 9 presets | `accent fill-accent ring-accent selected-` |
| `sky` | the printed sky, AI orb, Time-theme drift, `--pk-sky-*`, `--nva-sky-*` | `sky- orb- drift- dt- pk-sky nva-sky px- time-` |
| `glass` | frosted fills, mist, fog | contains `glass frost mist fog floating-fill toolbar-fill` |
| `radius` · `space` · `z` | DS scales (+ `--form-label-w`, `--pad-*`) | `radius- · space- pad- form-label-w · z-` |
| `type` | families, sizes (`--text-ui 13px`, `--text-meta 12px`, `--text-doc 16px`…), weights, line heights, `--type-*` font shorthands | `type- font- weight- lh- tracking-` + `text-` with a px value |
| `shadow` | elevation and every `*-shadow*` | contains `shadow` |
| `blur` | **observed** blur radii (`blur(Npx)` literals) — no blur tokens exist yet; reference only, not in tokens.css | — |
| `motion` | DS durations / transitions / `--ease-pop`, `--nx-in/out`, kit curves; `motion.curve.*` (MOTION.md § Curves) and `motion.scale.d90…d280` (the duration scale) are reference entries | `duration- transition- ease- *-ease *-spring` |
| `component.<prefix>` | tokens owned by one surface: `doc`, `pdc2`, `nva`, `v2p`, `pk`, `ppl`, `ios`, `paywall`, `dialog`… | first segment |

**Modes.** `$value` is the light theme. `$extensions["app.needt"].modes` holds the value for every
mode the token is declared in: `light`, `dark`, `warm` / `dim` (legacy previews, Settings no longer
offers them), `reduced-motion`, `accent:<id>:light|dark` (the 9 accent presets). A token is listed
in a mode even when the value text is the same: values containing `var()` are computed where they are
declared, so each theme scope must re-declare the ladder (themes.css header). Light / Dark map to the
prototype classes `.paper` / `.dark` (+ `:root`); accents to `[data-accent="<id>"]`.

**Values.** Colours, dimensions, durations and numbers use the DTCG types. Composite CSS
(shadows, gradients, `--type-*` font shorthands, transitions, `rgb` triplets such as
`--foreground-rgb: 26, 28, 30`) keep their CSS string as `$value` with `$type` `shadow`,
`gradient`, `typography`, `transition` or `string` — Style Dictionary passes them through. A value
that is exactly `var(--x)` is written as an alias `{group.x}`.

**Round trip.** `tokens.css` is regenerated from `tokens.json` (`port/tools/build-tokens-css.js`)
and re-parsed; the extract script fails if any (mode, token, value) differs from the source CSS.

**Port.** Keep the CSS names (the JSX reads them through `var()` and `cssVar()`); drop the
`component.*` prefixes only together with their components. `tokens-report.md` lists unused tokens,
duplicate values, dead redeclarations and the DS values the app overrides.
