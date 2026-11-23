# The Needt design system, stage 3 (2026-11-23)

Ten shared components, one token file, one guard. This PR adds them and
changes no screen: screens move onto them in waves, later. Owner decisions of
23.11.26: components in code first, screens migrate in waves; the base look is
the soft raised volume (`src/styles/v3-overrides/raised.css`, `raised-members.css`);
raised volume on controls and on cards and surfaces; the page `/admin/ds`.
`docs/handoff/PORT.md` §0 rule 5 is rewritten to match; everything else in
PORT.md is unchanged and still wins where it speaks to a screen.

| Where                                          | What                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `src/components/needt3/ds/`                    | the ten components (`index.ts` exports them)                 |
| `src/styles/ds/tokens.css`                     | every token a component reads                                |
| `src/styles/ds/components.css`                 | every component's style                                      |
| `src/styles/ds/lab.css`                        | the layout of `/admin/ds` only                               |
| `/admin/ds`                                    | every component x variant x size x state, light and dark     |
| `src/styles/__tests__/ds-guard.test.ts`        | fails a new shadow, grey, 14px or `*-btn` outside the system |
| `src/styles/__tests__/ds-guard-allowlist.json` | today's violations, per file; it can only shrink             |

## The rules the components keep

1. **One raised level per stack.** A lifted Surface (raised or glass), or a
   Sheet, that sits inside another lifted one renders flat: a hairline and
   nothing else. A card is never on a card. It is one CSS rule
   (`[data-ds-lift], .ds-sheet) [data-ds-lift]` in `components.css`) and it is
   tested (`ds/__tests__/css.test.ts`, `components.test.ts`).
2. **Elevation is the raised material** (`--ds-raised-*`): control, control
   pressed, well, surface, floating, and the ink control that is on. No
   component, and no screen that uses one, writes a shadow of its own.
3. **The accent is a mark, never a fill.** The switch knob is the one solid
   accent; a track or a chip may wash at 12 / 24 % (`--ds-mark-wash*`).
4. **Selected has one spelling.** `data-state="on" | "off"` plus the ARIA
   attribute for the role (`aria-pressed` toggle, `aria-selected` tab,
   `aria-checked` switch and radio, `aria-current="page"` a place). Written by
   `selectedAttrs()` in `state.ts`; the CSS reads only `data-state`. A screen
   never writes `.is-on`, `.is-active` or `.is-picked`.
5. **One press scale** (`--ds-press-scale: .97`), **one disabled opacity**
   (`--ds-disabled-opacity: .4`), **one focus outline** (2px `--ds-ring`).
6. **A 44px hit area on everything you can press,** drawn by `::after`, so a
   24 / 28 / 32 px control keeps its look. A badge or tag that cannot be pressed
   is a `span` and has none.
7. **Variant and size are data attributes,** never modifier classes: at most
   three variants and two sizes per component.
8. **Dark mirrors light** with the same volume, inverted: the raised aliases are
   declared again in the dark block (a custom property holding `var()` is
   substituted where it is declared).
9. **Type: chrome 13 and 12, phone row title 16, sheet title 28. No 14.**

## Tokens (`src/styles/ds/tokens.css`)

Nothing repeats an existing value: the ink ladder, fills, type shorthands and
raised material are the app's tokens under the names a component uses.

| Group  | Tokens                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| space  | `--ds-space-2 / 4 / 6 / 8 / 12 / 16 / 20 / 24`                                                                         |
| radius | `tag 8`, `control 12`, `card 16`, `plate 22`, `sheet 28`, `pill 999` (the phone's 39 radii become six)                 |
| height | `--ds-h-24 / 28 / 32 / 44 / 52 / 64`, `--ds-hit 44`                                                                    |
| ink    | `--ds-ink-100 / 85 / 70 / 55 / 40 / 25` (PORT rule 1)                                                                  |
| fill   | `--ds-fill-2 / 3 / 4 / 6 / 8 / 12`                                                                                     |
| mark   | `--ds-mark`, `--ds-mark-wash`, `--ds-mark-wash-strong`, `--ds-danger`, `--ds-ring`                                     |
| type   | `--ds-type-ui` 13, `-meta` 12 (+ medium), `-row` 16, `-button-lg` 16, `-sheet-title` 28                                |
| state  | `--ds-press-scale`, `--ds-disabled-opacity`, `--ds-ease`                                                               |
| raised | `-control-bg/-shadow/-pressed`, `-well`, `-knob`, `-surface-bg/-shadow`, `-floating-bg/-shadow`, `-ink-bg/-on/-shadow` |

The phone's own ink (v2p, 52 % and 28 %) is not a ladder step. When a screen
moves onto a component: 52 becomes 55, 28 becomes 25 (40 where the text has to
be read), the 16 % lavender wash becomes 12 %.

## Components

Every component forwards `className` and, where it is a native control, its
element's props. `force` (`"hover" | "pressed" | "focus"`) draws a state a
pointer cannot hold still; only `/admin/ds` sets it.

**Button** `variant: primary | secondary | text` (secondary), `size: md 32 | lg 52`,
`icon`, `danger` (text colour only), `block`, `busy`, `pressed` (makes it a
toggle). Why: eight button families (`pk-btn`, `ha-btn`, `nx-btn`, `pp-btn`,
`pw-btn`, `hq-btn`, `sg-btn`, the shadcn Button) drew the same thing at six
heights. Primary is ink, not accent.

**IconButton** `label` (required, it is the `aria-label`), `icon`,
`variant: flat | disc | ink`, `size: md 32 | lg 44`, `pressed`. Why: sixteen
round-button classes, none of them always labelled.

**Chip** `variant: disc | wash | empty`, `size: sm 24 | md 32`, `icon`, `on`,
`tone` (wash only, 12 %), `onClick` (a button) or none (a span), `onRemove`.
Why: 17 chip bases and 11 "small label with a wash" classes; a badge and a tag
are the same object.

**Switch** `checked`, `onChange(next)`, `size: md 50x30 | sm 28x16`, `role=switch`.
Why: eleven switch implementations; the knob is the one solid accent.

**Segmented** `items[{value,label,icon?,disabled?}]`, `value`, `onChange`,
`variant: pill | square | tabs`, `size: sm 28 | md 44`, `fill`, `aria-label`
(required). Radio group (pill, square) or tablist (tabs); arrow keys, Home and
End move the choice. Why: range pickers, view switches and tab bars were one
control written five times.

**Dock + DockItem** `Dock aria-label`; `DockItem icon, label, active, href |
onSelect, disabled`. A raised floating capsule with a disc per place; the place
you are in is ink and `aria-current="page"`. API and styles only: the live bar
(`bottom-bar-float.css`, PR #805) is not touched and keeps its own sheet until
the Menu wave swaps this in; `barStyle` stays a two-value skin of this one
component.

**Surface** `variant: raised | well | glass`, `size: md 16 | lg 22`,
`pad: none | md 16 | lg 20`, `as`. **Tile** `size: sm 28 | md 40`, `tone`.
Why: cards, plates and tiles were one thing in three radii; raised and glass
are lifted, a well is recessed. A lifted Surface in a lifted Surface is flat
(rule 1).

**Row** `variant: plain | grouped | nav`, `size: md 52 | lg 64`, `lead`
(a Tile, a check), `title`, `meta`, `trail`, `onPress | href`, `current`.
Why: ten row classes; the title is the phone's 16, the meta the chrome's 12. A
row with `onPress` or `href` is a button or a link and has the press fill; it
cannot hold a `trail` that is itself a control (a button in a button): use a
plain row for that.

**Sheet** `open`, `onClose`, `variant: bottom | dialog | anchored`,
`size: md | lg`, `title`, `meta`, `footer`, `label`, `anchor` (anchored),
`detents`, `keyboard` (bottom). `bottom` wraps the phone kit's `PkSheet`
(gestures, detents, scrim, focus trap: not forked; only its title is set to
the system's 28). `dialog` and `anchored` are a Radix Dialog and Popover
portaled into the v3 scope so they wear the person's theme. `SheetPanel` is the
static chrome (no portal) that `/admin/ds` draws.

**Field** `variant: filled | bare | search`, `size: md 32 | lg 52`, `label`,
`hint`, `error`, `icon`, `multiline`. Label, hint and error are wired by id
(`aria-describedby`, `aria-invalid`, `role="alert"` on an error); a tap anywhere
in the 44px box focuses the input. The 105px form-label column (PORT rule 4)
stays the form's business, not the Field's.

## Adding a variant

Only by editing `src/components/needt3/ds/` and `src/styles/ds/`, in the same
PR as the screen that needs it, and only after asking whether an existing
variant plus a token is enough. Never in a screen's own stylesheet: the guard
fails it. Steps: add the value to the component's union type, the rule to
`components.css` using tokens only, the state row to `Showcase.tsx`, and a test
to `ds/__tests__/`; then regenerate the baselines (below). More than three
variants or two sizes on one component means it is two components.

## The guard

`ds-guard.test.ts` reads every `src/**/*.css` outside `src/styles/ds/` and
`src/components/needt3/ds/` and fails when it finds, beyond the allowlist:

- a `box-shadow` that carries a colour literal (`var(...)`-only shadows pass);
- a new class ending `-btn`, `-chip`, `-switch` or `-seg`;
- a 14px `font-size` or `font`;
- a grey `rgba()` / hex off the ladder (alpha not in 100/85/70/55/40/25 or
  2/3/4/6/8/12, or an opaque non-pure grey).

Exempt: mock OS UI (`settings-mac`, `widget-preview`), the paywall and upgrade
sheet (`paywall`, `keep-pro`), the onboarding sky (`styles/onboarding/`,
`auth-sky`), agents night.

`ds-guard-allowlist.json` holds today's counts, generated once (2026-11-23):
**64** shadows in 18 files, **116** 14px sizes in 32 files, **732** off-ladder
greys in 21 files (393 of them are the theme palettes in `v3/themes.css`),
**183** component classes in 60 files. It is exact, not a ceiling: fix a
violation and the test asks you to lower the count (`DS_GUARD_UPDATE=1 npx jest
ds-guard`, which refuses to write a bigger file). Its totals are also capped in
the test itself and compared with `origin/main`'s when git can see it. Another
open PR that touches a CSS file's violations will need that one command after
rebasing.

## `/admin/ds` and the baselines

Admin-only (the admin layout checks once on the server; not linked from the
nav). `?scope=light|dark` draws one theme, `?hit=1` outlines each 44px hit
area. The Playwright suite `tests/visual/ds-showcase.spec.ts` shoots each
section per theme at 1440 and 390, checks there is no sideways scroll, and
measures every control's hit area. Baselines are generated by CI, not on a
laptop: `gh workflow run ci.yml --repo teenxgrailed/lumen-41 --ref <branch> -f
target_branch=codex/ds-core-baseline-2311`, then cherry-pick the commit.

`src/components/ui/design-system-lab.tsx` (the shadcn lab at `/style`) is kept:
it documents the legacy shadcn primitives the screens still use. It is retired
in wave 5, when the last shadcn Button and Input go; `/admin/ds` is the
system's page.

## Not in this PR

- No screen migrates and the live dock is not replaced.
- Desktop Row at 36 px is not a size: Row is 52 / 64 (the phone's rhythm); the
  dense desktop row stays on its own sheet until its wave decides.
- `PkSheet`'s own radius and scrim live in `phone-kit.css`, which belongs to an
  open PR; only the title is overridden here.
