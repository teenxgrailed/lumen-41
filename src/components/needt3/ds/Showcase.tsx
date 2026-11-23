"use client";

import { type ReactNode, useState } from "react";

import "@/styles/ds/lab.css";
import {
  LuBell,
  LuCalendarDays,
  LuCheck,
  LuFolder,
  LuHouse,
  LuListTodo,
  LuPlus,
  LuSearch,
  LuSend,
  LuSettings,
  LuX,
} from "react-icons/lu";

import {
  Button,
  Chip,
  Dock,
  DockItem,
  Field,
  IconButton,
  Row,
  Segmented,
  SheetPanel,
  Surface,
  Switch,
  Tile,
} from "./index";
import type { ForcedState, Tone } from "./state";

/*
 * /admin/ds: the design system, every component x variant x size x state, in
 * the light and the dark theme side by side. Each theme is a nested
 * `.needt-v3` scope with its own data-theme (the same trick the Appearance
 * miniatures use), so both render at once whatever the frame wears. States a
 * pointer cannot hold still (hover, pressed, focus) are drawn with `force`.
 */

type Scope = "both" | "light" | "dark";

const STATES = [
  "rest",
  "hover",
  "pressed",
  "selected",
  "disabled",
  "focus",
] as const;
type State = (typeof STATES)[number];

const FORCED: Partial<Record<State, ForcedState>> = {
  hover: "hover",
  pressed: "pressed",
  focus: "focus",
};

const noop = () => {};

function Cell({
  name,
  children,
  wide,
}: {
  name: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <figure className={wide ? "ds-lab-cell is-wide" : "ds-lab-cell"}>
      <div className="ds-lab-stage">{children}</div>
      <figcaption>{name}</figcaption>
    </figure>
  );
}

function LabRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="ds-lab-row">
      <div className="ds-lab-rowname">{name}</div>
      <div className="ds-lab-cells">{children}</div>
    </div>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="ds-lab-section" aria-labelledby={`${id}-h`} id={id}>
      <h3 id={`${id}-h`}>{title}</h3>
      {note ? <p className="ds-lab-note">{note}</p> : null}
      {children}
    </section>
  );
}

const None = () => <span className="ds-lab-none">n/a</span>;

/** One cell per state, the control drawn by `draw`; `null` means the state does not exist. */
function States({
  draw,
}: {
  draw: (state: State, force: ForcedState | undefined) => ReactNode | null;
}) {
  return (
    <>
      {STATES.map((state) => {
        const node = draw(state, FORCED[state]);
        return (
          <Cell key={state} name={state}>
            {node === null ? <None /> : node}
          </Cell>
        );
      })}
    </>
  );
}

function Tokens() {
  const ink = [
    ["100", "var(--ds-ink-100)"],
    ["85", "var(--ds-ink-85)"],
    ["70", "var(--ds-ink-70)"],
    ["55", "var(--ds-ink-55)"],
    ["40", "var(--ds-ink-40)"],
    ["25", "var(--ds-ink-25)"],
  ] as const;
  const fills = [
    ["2", "var(--ds-fill-2)"],
    ["3", "var(--ds-fill-3)"],
    ["4", "var(--ds-fill-4)"],
    ["6", "var(--ds-fill-6)"],
    ["8", "var(--ds-fill-8)"],
    ["12", "var(--ds-fill-12)"],
  ] as const;
  const radii = [
    ["tag 8", "var(--ds-radius-tag)"],
    ["control 12", "var(--ds-radius-control)"],
    ["card 16", "var(--ds-radius-card)"],
    ["plate 22", "var(--ds-radius-plate)"],
    ["sheet 28", "var(--ds-radius-sheet)"],
    ["pill", "var(--ds-radius-pill)"],
  ] as const;
  const space = [2, 4, 6, 8, 12, 16, 20, 24] as const;
  return (
    <Section
      id="tokens"
      title="Tokens"
      note="One file: src/styles/ds/tokens.css. Greys are one ink at six alphas, fills at six; nothing else."
    >
      <LabRow name="ink ladder">
        {ink.map(([name, color]) => (
          <Cell key={name} name={name}>
            <span className="ds-lab-swatch" style={{ color }}>
              Aa
            </span>
          </Cell>
        ))}
      </LabRow>
      <LabRow name="fill ladder">
        {fills.map(([name, color]) => (
          <Cell key={name} name={name}>
            <span className="ds-lab-swatch" style={{ background: color }} />
          </Cell>
        ))}
      </LabRow>
      <LabRow name="radius">
        {radii.map(([name, radius]) => (
          <Cell key={name} name={name}>
            <span
              className="ds-lab-swatch"
              style={{ borderRadius: radius, background: "var(--ds-fill-6)" }}
            />
          </Cell>
        ))}
      </LabRow>
      <LabRow name="space">
        {space.map((px) => (
          <Cell key={px} name={String(px)}>
            <span
              className="ds-lab-gap"
              style={{ width: `var(--ds-space-${px})` }}
            />
          </Cell>
        ))}
      </LabRow>
      <LabRow name="raised material">
        <Cell name="control">
          <span
            className="ds-lab-swatch"
            style={{
              borderRadius: "var(--ds-radius-pill)",
              background: "var(--ds-raised-control-bg)",
              boxShadow: "var(--ds-raised-control-shadow)",
            }}
          />
        </Cell>
        <Cell name="pressed">
          <span
            className="ds-lab-swatch"
            style={{
              borderRadius: "var(--ds-radius-pill)",
              background: "var(--ds-raised-control-bg)",
              boxShadow: "var(--ds-raised-control-pressed)",
            }}
          />
        </Cell>
        <Cell name="well">
          <span
            className="ds-lab-swatch"
            style={{
              borderRadius: "var(--ds-radius-pill)",
              background: "var(--ds-fill-4)",
              boxShadow: "var(--ds-raised-well)",
            }}
          />
        </Cell>
        <Cell name="surface">
          <span
            className="ds-lab-swatch"
            style={{
              borderRadius: "var(--ds-radius-card)",
              background: "var(--ds-raised-surface-bg)",
              boxShadow: "var(--ds-raised-surface-shadow)",
            }}
          />
        </Cell>
        <Cell name="floating">
          <span
            className="ds-lab-swatch"
            style={{
              borderRadius: "var(--ds-radius-card)",
              background: "var(--ds-raised-floating-bg)",
              boxShadow: "var(--ds-raised-floating-shadow)",
            }}
          />
        </Cell>
      </LabRow>
    </Section>
  );
}

function ButtonSection() {
  return (
    <Section
      id="button"
      title="Button"
      note="primary, secondary, text; md 32 and lg 52; a 44px hit area."
    >
      {(["primary", "secondary", "text"] as const).flatMap((variant) =>
        (["md", "lg"] as const).map((size) => (
          <LabRow key={`${variant}-${size}`} name={`${variant} / ${size}`}>
            <States
              draw={(state, force) =>
                state === "selected" && variant === "primary" ? null : (
                  <Button
                    variant={variant}
                    size={size}
                    force={force}
                    disabled={state === "disabled"}
                    pressed={state === "selected" ? true : undefined}
                  >
                    {state === "selected" ? "Saved" : "Save"}
                  </Button>
                )
              }
            />
          </LabRow>
        ))
      )}
      <LabRow name="options">
        <Cell name="icon">
          <Button icon={<LuPlus aria-hidden="true" />}>New task</Button>
        </Cell>
        <Cell name="danger (text colour only)">
          <Button danger>Delete</Button>
        </Cell>
        <Cell name="danger / text">
          <Button variant="text" danger>
            Delete
          </Button>
        </Cell>
        <Cell name="busy">
          <Button variant="primary" busy>
            Saving
          </Button>
        </Cell>
        <Cell name="block / lg" wide>
          <Button variant="primary" size="lg" block>
            Continue
          </Button>
        </Cell>
      </LabRow>
    </Section>
  );
}

function IconButtonSection() {
  return (
    <Section
      id="icon-button"
      title="IconButton"
      note="flat, disc, ink; md 32 and lg 44. Always labelled."
    >
      {(["flat", "disc", "ink"] as const).flatMap((variant) =>
        (["md", "lg"] as const).map((size) => (
          <LabRow key={`${variant}-${size}`} name={`${variant} / ${size}`}>
            <States
              draw={(state, force) => (
                <IconButton
                  label={variant === "ink" ? "Send" : "Close"}
                  icon={
                    variant === "ink" ? (
                      <LuSend aria-hidden="true" />
                    ) : (
                      <LuX aria-hidden="true" />
                    )
                  }
                  variant={variant}
                  size={size}
                  force={force}
                  disabled={state === "disabled"}
                  pressed={state === "selected" ? true : undefined}
                />
              )}
            />
          </LabRow>
        ))
      )}
    </Section>
  );
}

function ChipSection() {
  const tones: Tone[] = ["orange", "blue", "violet", "green", "yellow", "pink"];
  return (
    <Section
      id="chip"
      title="Chip"
      note="Also the pill, the badge and the tag. disc, wash, empty; sm 24 and md 32."
    >
      {(["disc", "wash", "empty"] as const).flatMap((variant) =>
        (["sm", "md"] as const).map((size) => (
          <LabRow key={`${variant}-${size}`} name={`${variant} / ${size}`}>
            <States
              draw={(state, force) => (
                <Chip
                  variant={variant}
                  size={size}
                  force={force}
                  disabled={state === "disabled"}
                  on={state === "selected"}
                  onClick={noop}
                  icon={
                    variant === "empty" ? (
                      <LuPlus aria-hidden="true" />
                    ) : undefined
                  }
                >
                  {variant === "empty" ? "Add" : "Today"}
                </Chip>
              )}
            />
          </LabRow>
        ))
      )}
      <LabRow name="static (a badge, a tag) and removable">
        <Cell name="badge / wash sm">
          <Chip variant="wash">Pro</Chip>
        </Cell>
        <Cell name="tag / disc sm">
          <Chip icon={<LuFolder aria-hidden="true" />}>Demesures</Chip>
        </Cell>
        <Cell name="removable">
          <Chip
            variant="wash"
            size="md"
            onRemove={noop}
            removeLabel="Remove German"
          >
            German
          </Chip>
        </Cell>
      </LabRow>
      <LabRow name="hue wash (12 %, wash only)">
        {tones.map((tone) => (
          <Cell key={tone} name={tone}>
            <Chip variant="wash" tone={tone}>
              {tone}
            </Chip>
          </Cell>
        ))}
      </LabRow>
    </Section>
  );
}

function SwitchSection() {
  const [live, setLive] = useState(true);
  return (
    <Section
      id="switch"
      title="Switch"
      note="One switch; md 50 x 30 and sm 28 x 16. The knob is the accent, as a mark."
    >
      {(["md", "sm"] as const).map((size) => (
        <LabRow key={size} name={size}>
          <States
            draw={(state, force) => (
              <Switch
                size={size}
                aria-label="Notifications"
                checked={state === "selected"}
                force={force}
                disabled={state === "disabled"}
                onChange={noop}
              />
            )}
          />
        </LabRow>
      ))}
      <LabRow name="live">
        <Cell name={live ? "on" : "off"}>
          <Switch aria-label="Live switch" checked={live} onChange={setLive} />
        </Cell>
      </LabRow>
    </Section>
  );
}

function SegmentedSection() {
  const [live, setLive] = useState("week");
  const items = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "year", label: "Year", disabled: true },
  ];
  return (
    <Section
      id="segmented"
      title="Segmented"
      note="Also the tab bar. pill, square, tabs; sm 28 and md 44. Arrow keys move the choice."
    >
      {(["pill", "square", "tabs"] as const).flatMap((variant) =>
        (["sm", "md"] as const).map((size) => (
          <LabRow key={`${variant}-${size}`} name={`${variant} / ${size}`}>
            <Cell name="rest, selected, hover, disabled">
              <Segmented
                aria-label={`${variant} ${size} a`}
                variant={variant}
                size={size}
                value="week"
                onChange={noop}
                items={items}
                force={{ value: "month", state: "hover" }}
              />
            </Cell>
            <Cell name="pressed">
              <Segmented
                aria-label={`${variant} ${size} b`}
                variant={variant}
                size={size}
                value="week"
                onChange={noop}
                items={items.slice(0, 3)}
                force={{ value: "day", state: "pressed" }}
              />
            </Cell>
            <Cell name="focus">
              <Segmented
                aria-label={`${variant} ${size} c`}
                variant={variant}
                size={size}
                value="week"
                onChange={noop}
                items={items.slice(0, 3)}
                force={{ value: "week", state: "focus" }}
              />
            </Cell>
          </LabRow>
        ))
      )}
      <LabRow name="live (fill)">
        <Cell name={live} wide>
          <Segmented
            aria-label="Live segmented control"
            fill
            value={live}
            onChange={setLive}
            items={items.slice(0, 3)}
          />
        </Cell>
      </LabRow>
    </Section>
  );
}

function DockSection() {
  const places = [
    { label: "Home", icon: <LuHouse aria-hidden="true" /> },
    { label: "Tasks", icon: <LuListTodo aria-hidden="true" /> },
    { label: "Calendar", icon: <LuCalendarDays aria-hidden="true" /> },
    { label: "Settings", icon: <LuSettings aria-hidden="true" /> },
  ];
  return (
    <Section
      id="dock"
      title="Dock"
      note="API and styles only; the live bar keeps its own sheet until its wave."
    >
      <LabRow name="one place on (ink), the rest raised discs">
        <Cell name="rest, selected">
          <Dock aria-label="Places (sample)">
            {places.map((place, index) => (
              <DockItem key={place.label} {...place} active={index === 0} />
            ))}
          </Dock>
        </Cell>
      </LabRow>
      <LabRow name="states">
        <Cell name="hover, pressed, focus, disabled">
          <Dock aria-label="States (sample)">
            <DockItem {...places[0]} force="hover" />
            <DockItem {...places[1]} force="pressed" />
            <DockItem {...places[2]} force="focus" />
            <DockItem {...places[3]} disabled />
          </Dock>
        </Cell>
      </LabRow>
    </Section>
  );
}

function SurfaceSection() {
  return (
    <Section
      id="surface"
      title="Surface"
      note="Card, plate, tile. raised, well, glass; md radius 16 and lg 22. One raised level per stack."
    >
      {(["raised", "well", "glass"] as const).flatMap((variant) =>
        (["md", "lg"] as const).map((size) => (
          <LabRow key={`${variant}-${size}`} name={`${variant} / ${size}`}>
            <Cell name="rest" wide>
              <Surface
                variant={variant}
                size={size}
                pad="md"
                style={{ width: "100%" }}
              >
                A {variant} {size === "lg" ? "plate" : "card"}
              </Surface>
            </Cell>
          </LabRow>
        ))
      )}
      <LabRow name="the one-level rule">
        <Cell name="a raised Surface inside a raised Surface is flat" wide>
          <Surface
            variant="raised"
            size="lg"
            pad="md"
            style={{ width: "100%" }}
          >
            <Surface variant="raised" pad="md" style={{ marginBottom: 8 }}>
              Raised, inside raised: a hairline
            </Surface>
            <Surface variant="well" pad="md" style={{ marginBottom: 8 }}>
              Well, inside raised: still recessed
            </Surface>
            <Surface variant="well" pad="md">
              <Surface variant="glass" pad="md">
                Glass inside a well inside raised: flat
              </Surface>
            </Surface>
          </Surface>
        </Cell>
      </LabRow>
    </Section>
  );
}

function RowSection() {
  const lead = (
    <Tile tone="blue">
      <LuBell aria-hidden="true" />
    </Tile>
  );
  return (
    <Section
      id="row"
      title="Row"
      note="plain, grouped, nav; md 52 and lg 64. The title is 16, the meta 12."
    >
      {(["plain", "nav"] as const).flatMap((variant) =>
        (["md", "lg"] as const).map((size) => (
          <LabRow key={`${variant}-${size}`} name={`${variant} / ${size}`}>
            <States
              draw={(state, force) => (
                <div style={{ width: 168 }}>
                  <Row
                    variant={variant}
                    size={size}
                    lead={lead}
                    title="Reminders"
                    meta="8:30"
                    force={force}
                    disabled={state === "disabled"}
                    current={state === "selected" ? true : undefined}
                    onPress={noop}
                  />
                </div>
              )}
            />
          </LabRow>
        ))
      )}
      <LabRow name="grouped in a Surface, with a Tile (sm and md)">
        <Cell name="grouped" wide>
          <Surface variant="raised" style={{ width: "100%" }}>
            <Row
              variant="grouped"
              lead={
                <Tile size="sm" tone="orange">
                  <LuCheck aria-hidden="true" />
                </Tile>
              }
              title="Plan the launch"
              meta="30 min"
              onPress={noop}
            />
            <Row
              variant="grouped"
              lead={
                <Tile tone="green">
                  <LuCalendarDays aria-hidden="true" />
                </Tile>
              }
              title="Review calendar sync"
              meta="45 min"
              trail="14:00"
              onPress={noop}
            />
            <Row variant="grouped" title="A row that is only text" />
          </Surface>
        </Cell>
      </LabRow>
    </Section>
  );
}

function SheetSection() {
  return (
    <Section
      id="sheet"
      title="Sheet"
      note="Sheet, dialog, popover, menu. bottom wraps the phone kit's PkSheet; dialog and anchored are a Radix Dialog and Popover. Shown here as the panel they are drawn on."
    >
      <LabRow name="bottom (28 title)">
        <Cell name="bottom" wide>
          <div className="ds-lab-sheet-room">
            <SheetPanel
              variant="bottom"
              title="New task"
              meta="Today"
              footer={
                <>
                  <Button variant="text">Cancel</Button>
                  <Button variant="primary">Add</Button>
                </>
              }
            >
              <Field
                label="Title"
                placeholder="What needs doing"
                defaultValue=""
              />
            </SheetPanel>
          </div>
        </Cell>
      </LabRow>
      <LabRow name="dialog / md, with a Surface inside (flat)">
        <Cell name="dialog">
          <SheetPanel
            variant="dialog"
            title="Delete the project?"
            footer={
              <>
                <Button variant="text">Cancel</Button>
                <Button variant="secondary" danger>
                  Delete
                </Button>
              </>
            }
          >
            <Surface variant="raised" pad="md">
              A raised Surface inside the sheet is a hairline.
            </Surface>
          </SheetPanel>
        </Cell>
      </LabRow>
      <LabRow name="anchored (a menu)">
        <Cell name="anchored">
          <SheetPanel variant="anchored" title="Move to">
            <Row variant="plain" title="Today" onPress={noop} />
            <Row variant="plain" title="Tomorrow" onPress={noop} />
            <Row variant="plain" title="Someday" onPress={noop} />
          </SheetPanel>
        </Cell>
      </LabRow>
    </Section>
  );
}

function FieldSection() {
  const [live, setLive] = useState("");
  return (
    <Section
      id="field"
      title="Field"
      note="filled, bare, search; md 32 and lg 52. Label, hint and error are wired by id."
    >
      {(["filled", "bare", "search"] as const).flatMap((variant) =>
        (["md", "lg"] as const).map((size) => (
          <LabRow key={`${variant}-${size}`} name={`${variant} / ${size}`}>
            <Cell name="rest">
              <div style={{ width: 168 }}>
                <Field
                  variant={variant}
                  size={size}
                  aria-label={`${variant} ${size} rest`}
                  placeholder={variant === "search" ? "Search" : "Title"}
                  icon={
                    variant === "search" ? (
                      <LuSearch aria-hidden="true" />
                    ) : undefined
                  }
                />
              </div>
            </Cell>
            <Cell name="filled in">
              <div style={{ width: 168 }}>
                <Field
                  variant={variant}
                  size={size}
                  aria-label={`${variant} ${size} value`}
                  defaultValue="Plan the launch"
                  icon={
                    variant === "search" ? (
                      <LuSearch aria-hidden="true" />
                    ) : undefined
                  }
                />
              </div>
            </Cell>
            <Cell name="focus">
              <div style={{ width: 168 }}>
                <Field
                  variant={variant}
                  size={size}
                  aria-label={`${variant} ${size} focus`}
                  defaultValue="Plan the launch"
                  forceFocus
                />
              </div>
            </Cell>
            <Cell name="disabled">
              <div style={{ width: 168 }}>
                <Field
                  variant={variant}
                  size={size}
                  aria-label={`${variant} ${size} disabled`}
                  defaultValue="Plan the launch"
                  disabled
                />
              </div>
            </Cell>
          </LabRow>
        ))
      )}
      <LabRow name="label, hint, error, multiline">
        <Cell name="label and hint">
          <div style={{ width: 200 }}>
            <Field label="Title" hint="Shown on the card" placeholder="Title" />
          </div>
        </Cell>
        <Cell name="error">
          <div style={{ width: 200 }}>
            <Field
              label="Email"
              error="Enter an email address"
              defaultValue="maks"
            />
          </div>
        </Cell>
        <Cell name="multiline">
          <div style={{ width: 200 }}>
            <Field
              label="Notes"
              multiline
              rows={2}
              placeholder="Anything to remember"
            />
          </div>
        </Cell>
        <Cell name={live ? "live: typed" : "live"}>
          <div style={{ width: 200 }}>
            <Field
              aria-label="Live field"
              placeholder="Type here"
              value={live}
              onChange={(event) => setLive(event.target.value)}
            />
          </div>
        </Cell>
      </LabRow>
    </Section>
  );
}

function ThemeScope({ theme }: { theme: "light" | "dark" }) {
  return (
    <section
      className="needt-v3 ds-lab-scope"
      data-theme={theme}
      data-testid={`ds-scope-${theme}`}
      aria-label={`${theme} theme`}
    >
      <h2>{theme}</h2>
      <Tokens />
      <ButtonSection />
      <IconButtonSection />
      <ChipSection />
      <SwitchSection />
      <SegmentedSection />
      <DockSection />
      <SurfaceSection />
      <RowSection />
      <SheetSection />
      <FieldSection />
    </section>
  );
}

export function DsShowcase({
  scope = "both",
  showHitAreas = false,
}: {
  scope?: Scope;
  showHitAreas?: boolean;
}) {
  const themes: Array<"light" | "dark"> =
    scope === "both" ? ["light", "dark"] : [scope];
  return (
    <div
      className="ds-lab"
      data-ds-showcase=""
      data-scope={scope}
      data-hit={showHitAreas ? "" : undefined}
    >
      <header className="ds-lab-head">
        <h1>Design system</h1>
        <p>
          Ten components, every variant, size and state, light and dark. The
          rules are in docs/handoff/design-system.md; the tokens in
          src/styles/ds/tokens.css. States a pointer cannot hold still are drawn
          forced.
        </p>
      </header>
      <div className="ds-lab-scopes">
        {themes.map((theme) => (
          <ThemeScope key={theme} theme={theme} />
        ))}
      </div>
    </div>
  );
}
