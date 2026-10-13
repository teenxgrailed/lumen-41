/* THE MINIATURE — a real screen of the product, drawn small.
 *
 * Every thumbnail in this kit used to be a grey bar diagram: a rail, three
 * dashes, two rounded rectangles. It reads as a wireframe of something, and a
 * person choosing a theme or a default view is not choosing a wireframe.
 *
 * So this draws the actual screen — the rail with its wordmark and nav rows,
 * a header, real task cards with their project tiles and hues, an hour grid
 * with a now-line — at FULL SIZE and then scales it down. Text at 10px scaled
 * to 0.38 is 3.8px: unreadable, but shaped exactly like type, which is what a
 * screenshot looks like at thumbnail size. Grey bars never look like that.
 *
 * One component for every place a miniature appears — themes in Settings, the
 * default view in setup, the brief's three forms — so the three of them cannot
 * drift into three different products.
 *
 *   <Miniature kind="day" theme="dark" width={112} />
 */
const MI_W = 320;
const MI_H = 206;

function miHue(name) {
  const p = window.NEEDT && window.NEEDT.project(name);
  return (p && p.color) || "var(--text-disabled)";
}

/* A line of type. Real text is drawn where the screen has text — at this
   scale it renders as the grey rhythm of a sentence, which is what the eye
   is actually matching against. */
function MiText({ children, size, weight, ink, width }) {
  return (
    <span className="docs-mi-mi-text-1" style={{ maxWidth: width, font: (weight || 400) + " " + (size || 10) + "px/1.35 var(--font-sans)", color: ink || "var(--text-primary)" }}>{children}</span>
  );
}

/* The project tile, at miniature scale: the same squircle with the same one
   step of lift, because it is the single most recognisable object here. */
function MiTile({ hue, size }) {
  const s = size || 14;
  return (
    <span className="docs-mi-mi-tile-1" aria-hidden="true" style={{ width: s, height: s, borderRadius: Math.round(s * 0.3), background: "linear-gradient(180deg, color-mix(in oklab, " + hue + " 90%, white), color-mix(in oklab, " + hue + " 96%, black))" }} />
  );
}

function MiCard({ title, meta, hue, wide }) {
  return (
    <span className="docs-mi-mi-card-1" style={{ width: wide }}>
      <MiTile hue={hue} size={13} />
      <span className="docs-mi-mi-card-2"><MiText size={9.5} weight={500}>{title}</MiText></span>
      {meta ? <MiText size={9} ink="var(--text-quaternary)">{meta}</MiText> : null}
    </span>
  );
}

/* The rail. Present in every miniature, because it is present in every screen
   and it is the first thing the eye uses to recognise the product. */
function MiRail() {
  const rows = [["Home", true], ["Calendar", false], ["Tasks", false], ["Docs", false]];
  return (
    <span className="docs-mi-mi-rail-1">
      <span className="docs-mi-mi-rail-2">
        <span className="font-display docs-mi-mi-rail-3">Needt</span>
      </span>
      <span className="docs-mi-mi-rail-4">
        <MiText size={9} ink="var(--text-disabled)">Find</MiText>
      </span>
      {rows.map(([label, on]) => (
        <span className={"docs-mi-mi-rail-5 docs-mi-mi-rail-s1" + (on ? " is-on" : "")} key={label}>
          <span className={"docs-mi-mi-rail-6 docs-mi-mi-rail-s2" + (on ? " is-on" : "")} />
          <MiText size={9} weight={on ? 500 : 400} ink={on ? "var(--accent)" : "var(--text-tertiary)"}>{label}</MiText>
        </span>
      ))}
      <span className="docs-mi-mi-rail-7"><MiText size={8} weight={500} ink="var(--text-quaternary)">PROJECTS</MiText></span>
      {["Operations", "Design system", "Resale"].map((n) => (
        <span className="docs-mi-mi-rail-8" key={n}>
          <span className="docs-mi-mi-rail-9" style={{ background: miHue(n) }} />
          <MiText size={9} ink="var(--text-tertiary)">{n}</MiText>
        </span>
      ))}
    </span>
  );
}

function MiHeader({ title, tabs, on }) {
  return (
    <span className="docs-mi-mi-header-1">
      <MiText size={13} weight={600}>{title}</MiText>
      {tabs ? (
        <span className="docs-mi-mi-header-2">
          {tabs.map((t) => (
            <span className={"docs-mi-mi-header-3 docs-mi-mi-header-s1" + (t === on ? " is-on" : "")} key={t}>
              <MiText size={8.5} weight={500} ink={t === on ? "var(--accent)" : "var(--text-muted)"}>{t}</MiText>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/* ── The five grounds ──────────────────────────────────────────────────── */

function MiDay() {
  return (
    <span className="docs-mi-mi-day-1">
      {/* The habit rail: the first thing on Home. */}
      <span className="docs-mi-mi-day-2">
        {[["German", true], ["Walk", true], ["Gym", false]].map(([n, on]) => (
          <span className="docs-mi-mi-day-3" key={n}>
            <span className={"docs-mi-mi-day-4 docs-mi-mi-day-s1" + (on ? " is-on" : "")} />
            <MiText size={9}>{n}</MiText>
          </span>
        ))}
      </span>
      <span className="docs-mi-mi-day-5">
        <span className="docs-mi-mi-day-6">
          <MiText size={9} weight={500} ink="var(--accent)">Today</MiText>
          <MiCard title="Draft the launch brief" meta="90m" hue={miHue("Operations")} />
          <MiCard title="Review the spec" meta="60m" hue={miHue("Design system")} />
          <MiCard title="German — unit 4" meta="60m" hue={miHue("German")} />
          <MiCard title="Ship the camera body" meta="45m" hue={miHue("Resale")} />
        </span>
      </span>
    </span>
  );
}

function MiColumns() {
  const cols = [
    ["Today", [["Draft the launch brief", "Operations"], ["Reply to the buyer", "Resale"]]],
    ["Tomorrow", [["Sign the quote", "Operations"], ["Landing copy", "Design system"], ["Archive August", "Life"]]],
    ["Thursday", [["German — unit 5", "German"]]]
  ];
  return (
    <span className="docs-mi-mi-columns-1">
      {cols.map(([day, items]) => (
        <span className="docs-mi-mi-columns-2" key={day}>
          <MiText size={9} weight={500} ink={day === "Today" ? "var(--accent)" : "var(--text-quaternary)"}>{day}</MiText>
          {items.map(([t, p]) => <MiCard key={t} title={t} hue={miHue(p)} />)}
        </span>
      ))}
    </span>
  );
}

function MiGrid() {
  const hours = [9, 10, 11, 12, 13];
  const blocks = [
    { at: 0.2, h: 26, title: "Draft the brief", p: "Operations" },
    { at: 1.6, h: 16, title: "1:1 Anna", p: "Design system", event: true },
    { at: 2.6, h: 30, title: "Print files", p: "Resale" }
  ];
  const row = 26;
  return (
    <span className="docs-mi-mi-grid-1">
      {hours.map((h, i) => (
        <span className="docs-mi-mi-grid-2" key={h} style={{ top: i * row }}>
          <span className="docs-mi-mi-grid-3"><MiText size={8} ink="var(--text-disabled)">{h}:00</MiText></span>
        </span>
      ))}
      {blocks.map((b) => (
        <span className="docs-mi-mi-grid-4" key={b.title} style={{ top: b.at * row + 2, height: b.h, background: b.event ? "color-mix(in oklab, " + miHue(b.p) + " 15%, var(--surface-raised))" : "var(--surface-raised)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, " + miHue(b.p) + " 40%, transparent), var(--shadow-ring)" }}>
          <MiTile hue={miHue(b.p)} size={11} />
          <MiText size={9} weight={500}>{b.title}</MiText>
        </span>
      ))}
      {/* The now-line: the one mark that says this is a live day. */}
      <span className="docs-mi-mi-grid-5" style={{ top: 2.15 * row }}>
        <span className="docs-mi-mi-grid-6" />
      </span>
    </span>
  );
}

function MiProse() {
  return (
    <span className="docs-mi-mi-prose-1">
      <MiText size={14} weight={600}>Week 36 — the September batch</MiText>
      <span className="docs-mi-mi-prose-2">
        <MiText size={9.5} ink="var(--text-secondary)">Legal sign-off is the only thing between us</MiText>
        <MiText size={9.5} ink="var(--text-secondary)">and the factory. Everything else is placed.</MiText>
        <MiText size={9.5} ink="var(--accent)">Three tasks are unplaced and 18 hours are open.</MiText>
      </span>
      <span className="docs-mi-mi-prose-3">
        {[["Ask counsel for a date", true], ["Send the print files", false]].map(([t, done]) => (
          <span className="docs-mi-mi-prose-4" key={t}>
            <span className={"docs-mi-mi-prose-5 docs-mi-mi-prose-s1" + (done ? " is-on" : "")} />
            <MiText size={9.5} ink={done ? "var(--text-muted)" : "var(--text-primary)"}>{t}</MiText>
          </span>
        ))}
      </span>
    </span>
  );
}

function MiCanvas() {
  return (
    <span className="docs-mi-mi-canvas-1">
      <span className="docs-mi-mi-canvas-2"><MiText size={13} weight={600}>Week 36</MiText></span>
      <span className="docs-mi-mi-canvas-3">
        <MiCard title="Print files" hue={miHue("Operations")} />
      </span>
      <span className="docs-mi-mi-canvas-4">
        <MiText size={9.5} ink="var(--text-secondary)">Legal sign-off is the only thing</MiText>
      </span>
      <span className="docs-mi-mi-canvas-5" />
      <span className="docs-mi-mi-canvas-6">
        <span className="font-display docs-mi-mi-canvas-7">18 h</span>
        <MiText size={8.5} ink="var(--text-muted)">free this week</MiText>
      </span>
      <svg className="docs-mi-mi-canvas-8" width="70" height="26" viewBox="0 0 260 130" fill="none">
        <path d="M20 100 C 60 24, 120 118, 168 60 S 230 20, 250 48" stroke="var(--text-quaternary)" strokeWidth="9" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const MI_KINDS = { day: MiDay, columns: MiColumns, grid: MiGrid, prose: MiProse, canvas: MiCanvas };
const MI_TITLES = { day: "Home", columns: "Calendar", grid: "Calendar", prose: "Home", canvas: "Home" };
const MI_TABS = {
  day: [["Today", "Prose", "Canvas"], "Today"],
  prose: [["Today", "Prose", "Canvas"], "Prose"],
  canvas: [["Today", "Prose", "Canvas"], "Canvas"],
  columns: [["Week", "Agenda", "Month"], "Agenda"],
  grid: [["Week", "Agenda", "Month"], "Week"]
};

/* The screen at full size, then scaled to whatever the thumbnail is. The
   scale is the whole trick: everything inside is authored at the real sizes
   the product uses, so what shrinks is a screen rather than a diagram. */
/* The Time theme's face (08.10.26): the screen cut on the DIAGONAL — the
   first theme (Light) top left, the second (Dark) bottom right — with a
   sun/moon disc sitting on the cut and a small "Auto" clock in the dark
   corner: the same screen, read by day and by night, switching on its own. */
function MiDayNight() {
  return (
    <span className="mi-diag-disc" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <g className="mi-diag-sun" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="8.6" cy="8.6" r="2.4" />
          <path d="M8.6 3.6v1.1M8.6 12.5v1.1M3.6 8.6h1.1M12.5 8.6h1.1M5.1 5.1l.8.8M11.3 11.3l.8.8M5.1 12.1l.8-.8M11.3 5.9l.8-.8" />
        </g>
        <path className="mi-diag-moon" d="M17.9 12.4a3.6 3.6 0 1 0 3.3 5.1 2.9 2.9 0 0 1-3.3-5.1Z" />
      </svg>
    </span>
  );
}
function MiAuto() {
  return (
    <span className="mi-diag-auto" aria-hidden="true">
      <svg width="7" height="7" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.3" /><path d="M6 3.6V6l1.6 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      Auto
    </span>
  );
}

function Miniature({ kind, theme, width, height, half, diagonal }) {
  const Body = MI_KINDS[kind] || MiDay;
  const w = width || 112;
  const h = height || Math.round(w * (MI_H / MI_W));
  const tabs = MI_TABS[kind];
  const screen = (
    <span className="docs-mi-miniature-1" style={{ width: MI_W, height: MI_H, transform: "scale(" + (w / MI_W) + ")" }}>
      <MiRail />
      <span className="docs-mi-miniature-2">
        <MiHeader title={MI_TITLES[kind] || "Home"} tabs={tabs && tabs[0]} on={tabs && tabs[1]} />
        <Body />
      </span>
    </span>
  );
  /* A pair of themes in one frame: the same screen, cut down the middle, so
     the rail and the blocks continue across the cut. */
  if (diagonal) {
    return (
      <span className="docs-mi-miniature-3 mi-diag" style={{ width: w, height: h }}>
        {[diagonal[0], diagonal[1]].map((t, i) => (
          <span key={i} className={"docs-mi-miniature-4 app " + (t === "light" ? "" : t) + (i === 0 ? " mi-diag-a" : " mi-diag-b")}>{screen}</span>
        ))}
        <svg className="mi-diag-seam" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="100" y1="0" x2="0" y2="100" vectorEffect="non-scaling-stroke" />
        </svg>
        <MiDayNight />
        <MiAuto />
      </span>
    );
  }
  if (half) {
    return (
      <span className="docs-mi-miniature-3" style={{ width: w, height: h }}>
        {[half[0], half[1]].map((t, i) => (
          <span key={i} className={"docs-mi-miniature-4 " + "app " + (t === "light" ? "" : t) + " docs-mi-miniature-s1" + (i === 0 ? " is-on" : "")}>{screen}</span>
        ))}
      </span>
    );
  }
  return (
    <span className={theme ? "app " + (theme === "light" ? "" : theme) : undefined}
      style={{ position: "relative", display: "block", width: w, height: h, overflow: "hidden",
        borderRadius: "var(--radius-lg)", background: "var(--background)" }}>
      {screen}
    </span>
  );
}

Object.assign(window, { Miniature, MiTile, MI_W, MI_H });
