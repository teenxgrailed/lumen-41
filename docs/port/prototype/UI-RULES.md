# Needt UI rules (fixed — port these as-is)

## Buttons — one system (`.nx-btn` in app.css)
| Look | Use | Default | Hover |
|---|---|---|---|
| **Primary** `.nx-btn-primary` | the one main action in a view | black #1a1c1e fill, white text (dark: white fill, #111214 text) | #34373b (dark: #e4e4e6) |
| **Secondary** `.nx-btn-secondary` | every other action (Create, New habit, Done, Restore) | `--surface-raised` + `--shadow-raised`, `--text-primary` | `--fill-2` overlay |
| **Text** `.nx-btn-text` | Cancel, Skip, Undo | no ground, `--text-tertiary` | `--fill-3` ground, `--text-secondary` |
| **Danger** `.nx-btn-danger` | destructive (Empty Trash, Delete forever) | text style in `--destructive` | destructive 9% ground |

- Default size: height 32, padding 0 14, radius 11, gap 6, `--type-ui-medium`, icon 14–15.
- Small `.nx-btn-sm`: height 28, padding 0 10, radius 9, 13px.
- Accent is never a button colour. One primary per view at most.

## Scale
- Control heights: 22 (chip) · 28 (small) · 32 (default) · 36 (input/round icon) · 64 (place tile).
- Radii: 6 chip · 9 small button · 11 button · `--radius-xl` tile · 16 card · 20 sheet · `--radius-3xl` page.
- Spacing: 2 / 4 / 6 / 8 / 10 / 12 / 16 / 24; 6 inside a group, 16–24 between groups.

## States
- **Hover**: one step of fill (`--fill-3`/`--fill-4`) or the overlays above. Never a colour change to accent.
- **Active**: `transform: scale(.97)`, 90 ms.
- **Focus** (keyboard): `outline: 2px solid var(--accent); outline-offset: 2px` — outside the object. Global for button / [role=button] / a; `.nx-focus` opts others in.
- **Selected**: `box-shadow: var(--text-primary) 0 0 0 1.5px inset` — inside the object, fill unchanged (`.nx-selected`, `aria-expanded` on `.nx-btn`, current place tile). Focus and selection never look alike.
- **Disabled**: `[disabled]` or `aria-disabled="true"` → opacity .4, cursor not-allowed, no hover, no press.
- **Error**: 1px inset `--destructive` ring on the field + a line saying what is wrong.
- **Done**: checkbox filled, title `--text-muted` + strike; habits fill in `--success`.

## Colour roles
- **Accent** = progress and selection only (progress bars, today/selected date, focus ring, drop target).
- **Red** (`--destructive`) = needs attention now, and is ALWAYS explained: a tooltip/title (`"3 overdue tasks"`) or a visible line under it ("These were due before today — move them or let them go.").
- **Green** (`--success`) = done / kept / money in.
- Everything else is greys from the foreground.

## Grey text
- Text that carries information (meta, counts, hints, labels, times) is at least `--text-tertiary`.
- `--text-quaternary` / `--text-muted` only for decoration, separators, done items and placeholders; `--text-disabled` only for disabled and empty-line hints.

## Task chips (right side of a task row)
- Order: time · duration · **source chip** (Mail/Calendar/Import icon + label ≤14ch, `--fill-2`, tertiary, title "From Mail · <label>"; Mail chip opens the message) · project chip.

## Deliberate exceptions (keep them)
1. **Home progress bar** — 3px pill at the bottom inside the Home tile, track `--fill-4`, fill `--accent-fill`, width 520 ms; tile itself stays neutral.
2. **Urgent tile pulse** — slow rose wash + ring on a tile that needs you now (overdue, event in ≤10 min), with a tooltip saying why.
3. **Coloured place glyphs** — sidebar places use duotone pictures in token hues, not currentColor icons.
4. **Places live in More** — any place not chosen as a tile sits in the More menu; nothing is lost.
5. **Settings is a sheet** over the current screen, not a route.
6. **Gradient accents** — `--accent-fill` may be a gradient on large fills (progress), never on text or buttons.
7. **Time theme** — the theme that shifts with the hour is allowed to tint grounds.
