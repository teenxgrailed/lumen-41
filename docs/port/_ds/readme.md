# Needt Design System

Needt is a single-user planner for the desktop: calendar, tasks, projects, documents and a focus mode in one app. Tasks and calendar events live on the same grid and the scheduler places work into real free hours. One person opens the same four screens forty times a day, so the interface is an **instrument panel, not a brochure**: dense, monochrome, quiet. Three themes ship together — light is the default and carries the identity; dim and dark are swaps of the same geometry. Stack: Next.js + React + Tailwind.

There is one product and one surface: the web app. No marketing site, no mobile app, no docs site was described in the source material, so none is recreated here.

## Sources

Everything in this project derives from two files, mounted read-only as `ds-input/`:

| File | Role |
| --- | --- |
| `ds-input/DESIGN.md` | **The authority** on rules, tone, component behaviour and anti-patterns. Front-matter dated 2026-08-31; owner decisions carry dates. |
| `ds-input/tokens.css` | The measured values: colour ladders, radii, type pairs, spacing steps, control metrics, z-index scale, eleven component classes. |

`DESIGN.md` records its own provenance: values measured from Craft Docs (docs.craft.do) at 1440×900 on 2026-08-31; the mechanism (six base colours, derived steps, ring-first elevation, z-index scale) re-authored from Craft Agents (`github.com/lukilabs/craft-agents-oss`, Apache-2.0). The accent, the third theme and the display serif are Needt's own. No screenshot of the current product was used — the current product is what this system replaces.

Not supplied, and therefore not invented here: a logo or brand mark, icon artwork, photography, illustration, font binaries, marketing copy.

## The three rules that outrank everything

1. **Every grey is one text colour at an alpha from the ladder.** Text runs 100 / 85 / 70 / 55 / 40 / 25. Fills run 2 / 3 / 4 / 6 / 8 / 12. Never author a new grey. If you need one that is not on the ladder, you have made a mistake.
2. **The interface type scale is 13px and 12px only.** 16px is document body text. There is no 14px anywhere in the chrome.
3. **The accent is never a solid fill on a button or a surface.** It appears only as a translucent fill at 12% or 24% with the accent itself as the text colour. Solid `--accent` is correct on a *mark* — the switch knob, the radio centre, a status dot, the calendar now-line. Marks are not surfaces.

A fourth, specific to this codebase: **every form row shares one label-column width and one row height** (`--form-label-w: 105px`, `--form-row-h: 32px`). The column is measured, not chosen: the product's longest label, "Auto-scheduled", is 99.97px at 13/500 Inter with the webfont loaded; ceiling 100px plus one 5px step of clearance = 105px. For scale at the same size: "Document width" 101.99 · "Week starts on" 92.95 · "Hard deadline" 86.57 · "Min chunk" 64.67. **Truncation policy:** a label that does not fit truncates on one line with an ellipsis and carries its full text in `title` — it never wraps. If a label needs more than 105px, shorten the label; widening the column re-opens the defect. Re-derive only when the longest real label changes, and record the measurement in `tokens/spacing.css`. Mixed label widths are the single defect this system exists to eliminate.

## Content fundamentals

**Voice.** Plain, short, mechanical. The app is a tool someone lives in, not a companion — it states, it does not encourage.

- **Verbs for actions, always.** The command bar is labelled `Open`, not a magnifier and not "Search". `Schedule`, `Reschedule`, `Capture`, `Plan my day`, `Move to project`, `Pin to this time`.
- **Sentence case everywhere.** "New task", "Auto-schedule", "Week starts on". Never Title Case, never ALL CAPS except the 12/500 section eyebrow (`PROJECTS`) and the weekday in a calendar cell (`MON`).
- **Second person only when the app must address the user**, and even then sparingly: "Star docs to keep them close." Not "your docs". No first person — the app never says "I".
- **No exclamation marks, no congratulation, no emoji.** "You're all caught up! 🎉" is exactly the register this system rejects. The empty inbox says "Nothing in the inbox. Anything you capture lands here first."
- **Empty states are one sentence plus one action.** State what would be here and how it gets here. Sidebar sections get a 12px grey italic hint instead of blank space.
- **Numbers are facts, not decoration.** "4 h 20 min of free time left · 2 tasks unplaced". Counts sit muted beside their label; durations and times are tabular figures.
- **Explain a convention once, in one line, under the thing it explains.** The calendar legend reads: "Grey rail: fixed. Coloured rail: the scheduler placed it and can move it again." It is not repeated on every block.
- **Errors name the fix**, in 12px destructive text under the field: "Pick a date in the future." No apology, no exclamation.
- Escape quotes and apostrophes in JSX as `&apos;` / `&quot;`.

## Visual foundations

**Colour.** Six base colours per theme and nothing else: `--background`, `--surface-raised`, `--foreground`, `--accent`, `--info`, `--success`, `--destructive`. Light is `#FCFDFE` canvas with a `#FFFFFF` raised surface — the two grounds never collapse; a card reads because the ground behind it is a step darker. Foreground `#1A1C1E` generates every grey in the product at the six text alphas and six fill alphas. Accent is Craft blue `#2E6DE9` (`oklch(0.567 0.199 262)`) in light, `#71B2FF` (`oklch(0.752 0.13 253.6)`) in dim and dark — clay is retired. It appears in exactly three roles: category identity on task blocks, state (overdue / done / warning), and selection. Nothing is coloured for decoration.

**Type.** Inter for everything, as the first entry in a system stack — `system-ui` resolves to real SF on macOS at zero bytes. The chrome runs at 13px (400 and 500, lh 16) and 12px (400 lh 14.4, and 500). 15/600/18 for card and section titles, 22/600 for a page heading, 24/700/29 for a document H1, 16/400/ 19.2 for document body. Instrument Serif is permitted at 28px and up only, tracking `-0.02em` — the day number on Today, empty states, sign-in — and never on a translatable string (Latin-only, 374 glyphs). JetBrains Mono carries values that must align: times, durations, shortcuts, token values.

**Spacing.** Steps 1, 2, 4, 5, 8, 16, 20 — the odd steps are deliberate; do not round 5 to 4 or 11 to 12. Dialog rhythm: 6px inside a group, 11px under a sub-line, 21px between groups. Two control heights exist: 32px standard, 28px compact. Page padding 20px, 32px at large sizes.

**Backgrounds.** Flat colour, always. No images, no gradients, no textures, no patterns, no full-bleed art — the source material contains none and the product has no room for any. The only depth cue is a hairline ring and a ground shift.

**Borders and elevation — ring first.** Depth comes from a 1px hairline ring at `--foreground / 8%`, never from a coloured surface and never from a glow. Controls are **recessed** (ring inside: `--shadow-inset-ring`); objects are **raised** (ring outside, plus thin layered shadows). Four shadow recipes and no more: `--shadow-raised` (five thin layers, avatar), `--shadow-container` (six layers, calendar strip), `--shadow-floating` (two blurs plus ring, menus and dialogs), `--shadow-sheet` (two layers, the document sheet). The chrome hairline is 1.5px (`--border-width`); inside a document it is 1px.

**Corner radii, assigned by object size, never globally.** 4 chips · 6 inner selection · 8 nav rows, icon buttons, tabs, chips (the workhorse) · 10 buttons and menu rows · 12 the command bar, inputs and panels · 14 avatar and space switcher · 16 cards and calendar days · 18 the floating action · 20 the calendar strip and dialogs · 26 the document sheet, the largest in the product · 9999 toggle groups and the editor toolbar.

**Cards.** Radius 16, `--surface-raised`, 1px ring, no resting shadow and no blur. Do not add a shadow to make a card "pop" — if it does not read, the ground is wrong.

**Hover, press, focus.** Hover is a fill step up: a row goes transparent → `--fill-3`, a button `--fill-3` → `--fill-4`. Press goes one further, to `--fill-5` / `--fill-6`. Nothing scales, nothing lifts, nothing changes hue. Focus is a **2px inset ring** at `--ring-accent` (accent at 40%) — never an outline offset, never a glow. Active navigation is a fill plus a weight bump — never an underline and never a left accent bar.

**Motion.** Two transitions and nothing else: `0.25s ease` on background, border and colour for the theme crossfade; `0.15s ease` on shadow, border and background for hover. No entrance animations, no stagger, no spring, no skeleton shimmer. The loading spinner's rotation is the only exception, because rotation is the whole message.

**Transparency and blur.** `backdrop-filter` appears exactly once in the product, on the floating action (`saturate(1.5) blur(32px)`). Everywhere else surfaces are separated by a hairline and a ground shift. Two surfaces are translucent without blur: the floating action and the editor toolbar (an 85%-opaque fill, tokenised as `--toolbar-fill` / `--floating-fill` so both follow the theme).

**Layout.** Two-pane shell: a 268px sidebar rail beside a flexible main column. The header is fixed-height, the content scrolls. Density over comfort — whitespace that costs a visible row costs the user a scroll. Scrollbars are 8px with a `--border` thumb on a transparent track; inside a scrolling region use the 4px variant that appears on hover of the group (`.scroll-inner`).

**Imagery.** There is none, and adding some would be a change of direction, not a refinement. Document cards show a miniature of the page's own text; avatars are initials on a raised square.

## Iconography

The source material ships **no icon artwork** — no icon font, no SVG sprite, no PNG set. It also does not ship an icon layer, on purpose: **the product depends on `react-icons`, and a design system that pins a second icon library against it is a liability.** `Icon` is therefore a *contract*, not a dependency.

- **The contract.** `Icon` renders (a) the component passed as `glyph`, or (b) the component the host registered under `name` on `window.NeedtIcons`, announced with `window.dispatchEvent(new Event("needt-icons"))`. With neither, it renders a reserved empty box of the right size — layout holds and the gap is visible.
- **In the application:** `import { LuCalendarDays } from "react-icons/lu"` and pass it — `<Icon glyph={LuCalendarDays} size={20} />` — or skip `Icon` and render the react-icons component directly. The system imports nothing.
- **In static pages and prototypes:** load `assets/icons/needt-icons.js` as a module. It resolves every name this system uses from `react-icons/lu` with fallbacks, so a renamed upstream glyph degrades to an empty box rather than a crash. It is host code; a different react-icons collection is a one-line change to its import.
- **Which collection the product uses is unconfirmed.** `lu` is the default here because its 24×24 outline geometry, round caps and `currentColor` stroke match an instrument panel. If the product standardised on another set, change that one import.
- **Sizes:** 13px inside a chip, 16px in a control, 20px in a nav row, 24px in an empty state. Stroke 1.75 at every size.
- **Colour:** always `currentColor`. An icon never carries a colour its label does not.
- **Filled variants** are reserved for the active nav row (`filled` prop). Everywhere else icons are outline.
- **Emoji are never used** — not in UI, not in copy, not in empty states.
- **Unicode as icon** is allowed in exactly two places, both typographic rather than decorative: keyboard shortcuts (`⌘K`, `⌘⇧S`, `⌫`, `esc`) and the chip remove glyph (`×`).
- **Status is a 6px dot**, not a glyph: `StatusDot` in accent / success / info / destructive.

## Logo

**No logo, wordmark file or brand mark was supplied, and none has been drawn.** Wherever a mark would go, the product renders the name in type: Inter 600 with `-0.02em` tracking at 100% foreground (see `guidelines/brand-wordmark.card.html`). Instrument Serif is permitted for the name on sign-in and empty screens. If a real mark exists, drop the SVG in `assets/` and swap the two places that render the word: `ui_kits/needt-app/Sidebar.jsx` and `thumbnail.html`.

## Index

| Path | What it is |
| --- | --- |
| `styles.css` | The single entry point consumers link. `@import` lines only. |
| `tokens/colors.css` | Six base colours per theme plus the full derived ladder, repeated in `:root`, `.dark`, `.dim`. |
| `tokens/typography.css` | Families, sizes, line-heights, weights, composed `--type-*` shorthands. |
| `tokens/spacing.css` | Spacing steps, control metrics, **form-row metrics**, dialog metrics, shell metrics. |
| `tokens/radius.css` · `elevation.css` · `motion.css` · `zindex.css` | Radius by object, ring-first shadows, two transitions, sixteen z-steps. |
| `tokens/fonts.css` | Google Fonts delivery for Inter, Instrument Serif, JetBrains Mono. |
| `tokens/base.css` | Reset, body defaults, scrollbars, focus, selection, link colours. |
| `tokens/components.css` | The eleven measured classes from the source, for plain-HTML consumers. |
| `tokens/ui.css` | Classes for the families the source names but does not draw (forms, menus, dialogs, date picker, tooltips, blocks, states). `nt-` prefixed. |
| `components/core/` | Button, IconButton, Chip, SegmentedControl, ToggleGroup, Icon, Spinner, StatusDot |
| `components/forms/` | FormRow + FormGroup, Input, Textarea, Select, Checkbox, Radio + RadioGroup, Switch, DatePicker |
| `components/overlays/` | Dialog, Menu + MenuItem + MenuLabel + MenuSeparator + DropdownMenu, ContextMenu, Tooltip, Popover |
| `components/surfaces/` | Card, DocumentSheet, Avatar, FloatingAction, EmptyState + SidebarHint, Skeleton + SkeletonRows |
| `components/navigation/` | NavRow + NavSection, CommandBar |
| `components/calendar/` | CalendarStrip, CalendarDay, CalendarBlock, DayTimeline, FreeSlot |
| `guidelines/*.card.html` | 20 foundation specimens: Colors, Type, Spacing, Elevation, Brand. |
| `ui_kits/needt-app/` | The click-through product recreation. See its README. |
| `thumbnail.html` | The project tile. |
| `SKILL.md` | Agent-Skills wrapper (`needt-design-system-kit`, not user-invocable) declaring this a generated snapshot subordinate to `/DESIGN.md` and the `needt-design` skill. |
| `assets/icons/needt-icons.js` | Host-side icon registry over `react-icons`. Not part of the system's dependencies. |

Each component directory carries `<Name>.jsx`, `<Name>.d.ts` (props contract), `<Name>.prompt.md` (what & when, plus a usage example) and one `@dsCard` HTML.

## Intentional additions

The source names most of these families in prose; these are the ones it does not name at all, added because the brief requires every state to exist:

- **Icon** — a wrapper over the substituted glyph set, so a future swap touches one file.
- **Spinner / Skeleton / SkeletonRows** — the loading state. `DESIGN.md` specifies no loading treatment; these use `--fill-3` and the one permitted rotation.
- **StatusDot** — a 6px state mark, so status never rides the calendar rail (which carries movability and nothing else).
- **Avatar** — the source measures the object (36×36, radius 14, layered shadow) without naming a component.
- **FormGroup, NavSection, SidebarHint, MenuLabel/Separator, DropdownMenu, ContextMenu, RadioGroup** — structural helpers the named components need.

## Corrections to the source

Two defects in `ds-input/tokens.css` were fixed rather than reproduced, and both are worth reading:

1. **Theme derivation was broken.** The text and fill ladders were declared once on `:root` as `rgba(var(--foreground-rgb), α)`. A custom property containing `var()` is substituted where it is *declared*, so `.dark` and `.dim` recoloured their base values while every derived grey stayed on the light foreground. The ladder is now repeated verbatim inside all three scopes. Change an alpha in one block and you must change it in all three.
2. **RGB triplets did not match their hexes** (e.g. `--destructive: #E6000C` with `--destructive-rgb: 180, 60, 50`), so every `rgba()` derivation landed on a different colour than the documented one. All triplets are now derived from the stated hexes. Dark accent follows `DESIGN.md`'s `#D87F62` (216, 127, 98) rather than the token file's drifted value.

Also: `DESIGN.md` lists six text levels (adding 25% for placeholders and empty states) where the token file's header comment says four. Six are implemented. The Tailwind v4 `@theme inline` block and `@import "tailwindcss"` were dropped — this project ships plain CSS custom properties that any consumer can link.

## Corrections, continued

3. **`--foreground` and its own ladder were two different greys.** The source declares `oklch(0.245 0.008 250)` annotated `#1A1C1E`; that OKLCH actually renders **#1E2124**, while `--foreground-rgb: 26, 28, 30` — which generates every text level and every fill — is the annotated hex. Solid foreground and derived foreground therefore disagreed. Pinned to `#1a1c1e`; the equivalent OKLCH is `oklch(0.2295 0.0053 247)`.
4. **`--form-label-w` was a round number.** 160px was invented, and a round number is exactly what produces a two-line label. Re-derived by measurement — see the fourth rule above.

## Verified, not asserted

The three-scope claim was checked by resolution, not by counting declarations — declaration parity is what looked fine while the bug was live. Rendering one Button, one NavRow and one Input inside `:root`, `.dim` and `.dark` and reading computed styles:

| | light | dim / dark |
|---|---|---|
| Button background (`--fill-3`) | `rgba(26, 28, 30, 0.04)` | `rgba(249, 249, 249, 0.04)` |
| Button colour (`--text-secondary`) | `rgba(26, 28, 30, 0.85)` | `rgba(249, 249, 249, 0.85)` |
| NavRow active (`--fill-4`) | `rgba(26, 28, 30, 0.06)` | `rgba(249, 249, 249, 0.06)` |
| Input ring (`--shadow-inset-ring`) | `rgba(26, 28, 30, 0.08) 0 0 0 1px inset` | `rgba(249, 249, 249, 0.08) 0 0 0 1px inset` |
| `--fill-accent` | `rgba(46, 109, 233, 0.12)` | `rgba(113, 178, 255, 0.12)` |
| `--shadow-focus` | `rgba(46, 109, 233, 0.4) 0 0 0 2px inset` | `rgba(113, 178, 255, 0.4) 0 0 0 2px inset` |

Reproduce it against any component: render it inside a `.dark` wrapper and read `getComputedStyle`, rather than grepping the token file.
