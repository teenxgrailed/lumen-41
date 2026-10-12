const { Card, IconButton, Icon, Switch, Menu, MenuItem, DropdownMenu } = window.NeedtDesignSystem_25d3c8;

/* SETTINGS — a full screen, not a dialog. The left rail is the table of
   contents; the right column is one section at a time, so a form row never
   competes with a form row from another subject.
   Every row is FormRow: one 105px label column, one 32px row height. A label
   that does not fit is shortened here, never widened there. */
/* One person, one Needt (08.10.26): there are no spaces to switch between and
   no space-level settings. Teams will live inside your Needt later. */

/* The person Settings belongs to. Same mock as the sidebar's profile. */
const ME = { name: "Maksym K.", email: "maksym@needt.app", initials: "MK" };

/* THEMES, THEME_CLASS and ACCENTS live in settings-kit.jsx (loaded first). */

/* Time (08.10.26): the same mini screen cut on the diagonal — Light up top
   left, Dark down bottom right, a sun/moon on the cut and an "Auto" clock
   hint — so it reads as the sibling of System (cut down the middle). Drawn
   by Miniature (diagonal). */
function ThemePicture({ id, width }) {
  if (id === "system") return <window.Miniature kind="day" width={width} half={["paper", "dark"]} />;
  if (id === "time") return <window.Miniature kind="day" width={width} diagonal={["paper", "dark"]} />;
  return <window.Miniature kind="day" width={width} theme={THEME_CLASS[id] || "paper"} />;
}

/* ---------- Craft-pattern primitives ----------
   Measured from Craft's settings sheet (06.10.26): a group is a 10px-radius
   stack of rows on fill-3, rows split by a 2px seam of the sheet itself; a row
   is 10/12 padding, title 13/600, description 12 at tertiary, control right. */
function SGroup({ title, hint, children, menu }) {
  return (
    <section className="settings-sgroup">
      {title ? (
        <div className="base-stack">
          <span className="settings-sgroup-text">{title}</span>
          {hint ? <span className="base-meta settings-sgroup-text-2">{hint}</span> : null}
        </div>
      ) : null}
      <div className={"settings-sgroup-stack" + (menu ? " has-menu" : "")}>{children}</div>
    </section>
  );
}
function SRow({ title, desc, children, tone, onClick, lead, expanded }) {
  const click = !!onClick;
  return (
    <div onClick={onClick}
      role={click ? "button" : undefined} tabIndex={click ? 0 : undefined} aria-expanded={expanded == null ? undefined : !!expanded}
      className={"settings-srow-row" + (desc ? " has-desc" : "") + (click ? " is-click nx-focus" : "")}
      onKeyDown={click ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(e); } } : undefined}>
      {lead || null}
      <div className="base-stack settings-srow-stack">
        <span className={"settings-srow-text settings-srow-title" + (tone === "danger" ? " is-danger" : "")}>{title}</span>
        {desc ? <span className="settings-srow-text-2">{desc}</span> : null}
      </div>
      {children != null ? <div className="base-row settings-srow-row-2" onClick={(e) => e.stopPropagation()}>{children}</div> : null}
    </div>
  );
}
/* Craft's select: a 32px pill on fill-3 with a hairline, value at 13, the
   up-down chevron at the right. Native underneath, so the OS menu opens. */
function SSelect({ value, options, onChange, width }) {
  return (
    <span className="settings-sselect-row" style={{ width: width || 140 }}>
      <select className="settings-sselect-select" value={value} onChange={(e) => onChange && onChange(e.target.value)}
       >
        {options.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
      <span className="settings-sselect-layer"><Icon name="chevrons-up-down" size={13} /></span>
    </span>
  );
}
function SBtn({ children, tone, onClick, icon }) {
  const danger = tone === "danger";
  if (danger) {
    return (
      <button type="button" onClick={onClick} className="nx-btn nx-btn-danger">
        {icon ? <Icon name={icon} size={14} /> : null}{children}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className="nx-btn nx-btn-secondary">
      {icon ? <Icon name={icon} size={14} /> : null}{children}
    </button>
  );
}
function Kbd({ k }) {
  return <span className="settings-kbd-grid">{k}</span>;
}
/* Craft shows themes as large pictures in one card, the name under each, the
   chosen one ringed and named in the accent. */
/* Pro (08.10.26, paywall.jsx): the Time theme and every accent but the
   default are Pro. `pro` — null for a free tile, true / false for a Pro one
   (Pro plan / Free plan). A locked tile opens the paywall instead. */
const PRO_FEATURES = [
  ["Plan my day", "Needt places what has no time yet into your free hours"],
  ["Week load", "Each day's plan against your working hours"],
  ["Document themes", "All Styles and backdrops for your pages"],
  ["Time theme and accents", "The theme that follows the sun, every accent colour"],
  ["Unlimited moodboards", "As many boards as you like, and Pinterest"],
  ["Every connection", "More than one mail account, AI tools, MCP and API"],
  ["Unlimited habits", "Free keeps three"]
];
function SProPill({ locked }) { return window.ProBadge ? <window.ProBadge size="sm" locked={!!locked} /> : null; }
function ThemeTile({ id, label, active, onPick, pro }) {
  const locked = pro === false;
  return (
    <button type="button" onClick={() => (locked ? window.openPaywall && window.openPaywall("Time theme") : onPick(id))} aria-pressed={active} data-theme-tile={id}
      data-pro-locked={locked ? "" : undefined} title={locked ? "Unlock the Time theme with Pro" : undefined} className={"nx-press settings-theme-tile-theme-tile" + (active ? " is-active" : "")}
     >
      <span className="settings-theme-tile-span">
        <span className="settings-theme-tile-span-2">
          <ThemePicture id={id} width={128} />
        </span>
      </span>
      <span className="settings-theme-tile-span-3">{label}{pro != null ? <SProPill locked={locked} /> : null}</span>
    </button>
  );
}
/* One accent. The swatch carries its own data-accent, so it shows the accent
   as it will be in the current theme (light values on light, dark on dark)
   and the ring around the chosen one is drawn in that accent too. */
function AccentSwatch({ id, label, active, onPick, locked }) {
  return (
    <button type="button" data-accent={id} aria-label={label + (locked ? " — Pro" : "")} aria-pressed={active} title={locked ? label + " — unlock accent colours with Pro" : label}
      data-pro-locked={locked ? "" : undefined}
      onClick={() => (locked ? window.openPaywall && window.openPaywall("Accent colours") : onPick(id))} className={"nx-press settings-accent-swatch-accent" + (locked ? " is-locked" : "") + (active ? " is-active" : "")}>
      {active ? <span className="settings-accent-swatch-layer"><Icon name="check" size={13} /></span> : null}
    </button>
  );
}
const FREE_ACCENT = "blue";
function AccentCard({ accent, onAccent, pro }) {
  const cur = ACCENTS.find((a) => a[0] === accent) || ACCENTS[0];
  const lock = (id) => !pro && id !== FREE_ACCENT;
  return (
    <div className="settings-accent-card-stack">
      <div className="settings-accent-card-row">
        <span className="settings-accent-card-row-2">
          {ACCENTS.filter((a) => !a[2]).map(([id, l]) => <AccentSwatch key={id} id={id} label={l} active={accent === id} onPick={onAccent} locked={lock(id)} />)}
        </span>
        <span className="settings-accent-card-bar" aria-hidden="true" />
        <span className="settings-accent-card-row-2">
          {ACCENTS.filter((a) => a[2]).map(([id, l]) => <AccentSwatch key={id} id={id} label={l} active={accent === id} onPick={onAccent} locked={lock(id)} />)}
        </span>
      </div>
      {!pro ? (
        <div className="settings-accent-lock" data-settings-accent-lock>
          <Icon name="lock" size={12} /><span>Blue is yours on Free. The other eight come with Pro.</span>
          <button type="button" className="pro-limit-up" onClick={() => window.openPaywall && window.openPaywall("Accent colours")}>Upgrade</button>
        </div>
      ) : null}
      <div className="settings-accent-card-row-3">
        <span className="base-strong">{cur[1]}</span>
        <span className="base-meta">{cur[2] ? "Fills take the blend; text and rings take its middle." : "Selection, links, the now-line and progress."}</span>
        <span className="settings-accent-card-span">
          <span className="settings-accent-card-span-2" />
        </span>
      </div>
    </div>
  );
}
/* The Time card's live reading: where the sun is and what comes next. */
function TimeNow({ day }) {
  const t = day && day.time;
  if (!t) return null;
  const icon = t.phase === "Dawn" ? "sunrise" : t.phase === "Dusk" || t.phase === "Night" ? "sunset" : "sun";
  return (
    <div className="base-row settings-time-now-time-now" data-time-now>
      <span className="settings-time-now-row"><Icon name={icon} size={14} /></span>
      <span>{t.line}</span>
    </div>
  );
}

/* The person's face: initials on a quiet disc, the plan badge on its corner.
   Same avatar as the Account section's profile card. */
function MeAvatar({ size }) {
  return <span className={"settings-me-avatar" + (size === "lg" ? " is-lg" : "")} aria-hidden="true">{ME.initials}</span>;
}

/* A fourth field names a screen: that row does not open a section here, it
   leaves Settings and goes there (08.10.26). Its row carries an arrow-up-right
   after the name so it reads as "opens elsewhere". Connections is managed on
   its own screen only — Settings keeps no second copy of it.
   Groups (08.10.26, one Needt per person): you first (account, plan), then how
   Needt behaves for you, then your data and the way out to Connections. */
const NAV = [
  ["", [["account", "Account", "user"], ["plan", "Plan & billing", "credit-card"]]],
  ["Preferences", [["general", "General", "sliders-horizontal"], ["appearance", "Appearance", "palette"], ["day", "Your day", "clock"], ["tasks", "Tasks", "list-checks"], ["focus", "Focus", "target"], ["alerts", "Notifications", "bell"], ["keys", "Shortcuts", "command"]]],
  ["", [["calendars", "Connections", "cable", "connections"], ["data", "Data & privacy", "database"]]],
  ["", [["about", "About", "info"]]]
];
const NAV_FLAT = NAV.reduce((a, g) => a.concat(g[1]), []).filter((x) => !x[3]);
const TITLES = { general: "General", day: "Your day", tasks: "Tasks", focus: "Focus", appearance: "Appearance", alerts: "Notifications", keys: "Shortcuts", data: "Data & privacy", account: "Account", plan: "Plan & billing", about: "About" };
/* What happens when a trial ends — said the same way wherever a trial is offered. */
const TRIAL_TERMS = "When the trial ends you go back to Free unless you choose a plan — we'll remind you 3 days before. No card, no automatic charge.";
const MIN = (a) => a.map((m) => [String(m), m + " min"]);

function SettingsScreen({ theme, onTheme, accent, onAccent, day, onBack: leaveNow, onSignOut, aura, onAura }) {
  /* Another screen can open Settings at a section: set
     window.needtSettingsSection = "plan" (or any NAV id) before going to
     Settings; it is read once and cleared. Default: Account. */
  const [section, setSection] = React.useState(() => {
    const want = window.needtSettingsSection;
    window.needtSettingsSection = null;
    return want && TITLES[want] ? want : "account";
  });
  const conn = window.useConnections ? window.useConnections() : {};
  /* Plan state + pricing live in paywall.jsx (window.useNeedtPlan, window.needtPrice). */
  const [tier, setTier] = (window.useNeedtPlan || (() => ["free", () => {}]))();
  const tierInfo = window.needtPlanInfo ? window.needtPlanInfo(tier) : { name: "Free", line: "", badge: "Free", pro: false };
  const PR = window.needtPrice || {}, PRc = window.NEEDT_PRICING || {};
  const isPro = tierInfo.pro && tier !== "trial";
  const openPw = (c) => { if (window.openPaywall) window.openPaywall(c ? { cycle: c } : undefined); else setSection("plan"); };
  const openPwFeature = (f) => { if (window.openPaywall) window.openPaywall(f); };
  /* The sheet leaves the way it came: it sinks and fades, then the route
     changes. Every way out goes through here. */
  const [closing, setClosing] = React.useState(false);
  const onBack = React.useCallback(() => { setClosing(true); window.setTimeout(leaveNow, 170); }, [leaveNow]);
  /* A nav row that names another screen: the sheet sinks the same way, then
     that screen opens in place of the one underneath. */
  const leaveTo = (scr) => {
    setClosing(true);
    window.setTimeout(() => { if (window.__app && window.__app.setScreen) window.__app.setScreen(scr); else leaveNow(); }, 170);
  };
  const [saved, setSaved] = React.useState(0);
  /* Every control reads and writes the one settings object (stores.jsx,
     localStorage "needt.settings"); the phone reads the same object. */
  const [v, setS] = window.useSettings();
  const set = (k) => (x) => { setS(k, x); setSaved(Date.now()); };
  const navRef = React.useRef(null);

  /* Nothing is saved with a button. A change writes itself and says so once
     in the header, then the mark leaves. */
  function mark(setter) { return (x) => { setter(x); setSaved(Date.now()); }; }
  React.useEffect(() => {
    if (!saved) return undefined;
    const id = window.setTimeout(() => setSaved(0), 1700);
    return () => window.clearTimeout(id);
  }, [saved]);
  React.useEffect(() => {
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); onBack(); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  function navKeys(e) {
    const at = NAV_FLAT.findIndex((x) => x[0] === section);
    if (e.key === "ArrowDown") { e.preventDefault(); setSection(NAV_FLAT[Math.min(at + 1, NAV_FLAT.length - 1)][0]); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSection(NAV_FLAT[Math.max(at - 1, 0)][0]); }
  }
  const sw = (k) => <Switch checked={!!v[k]} onChange={set(k)} />;
  /* Your day → Planning options: folded until asked for; folded, its row
     says in one line what is set. */
  const [advOpen, setAdvOpen] = React.useState(false);
  const ORDER_WORD = { deadline: "nearest deadline first", short: "shortest first", project: "by project" };
  const advSummary = (v.auto ? "Plans automatically" : "Plans when you ask") + " · " + (ORDER_WORD[v.order] || ORDER_WORD.deadline) + " · " + (v.buffer || 0) + "-min gap";
  const HOURS = ["07:00", "08:00", "08:30", "09:00", "10:00", "17:00", "18:00", "19:00", "20:00"].map((h) => [h, h]);

  return (
    <div role="presentation" className={"settings-presentation " + "nx-scrim" + (closing ? " is-leaving" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onBack(); }}
     >
      <div role="dialog" aria-modal="true" aria-label="Settings" className={"settings-settings " + "settings-sheet nx-sheet" + (closing ? " is-leaving" : "")}
       >

        {/* left: you, the plan, then the table of contents */}
        <nav ref={navRef} tabIndex={0} onKeyDown={navKeys} aria-label="Settings sections" className="scroll-inner settings-sections"
         >
          <button className="settings-stack settings-me" type="button" data-settings-me onClick={() => setSection("account")} title="Open Account">
            <span className="settings-span">
              <MeAvatar size="lg" />
              <span className="settings-tier" data-settings-tier>{tierInfo.badge}</span>
            </span>
            <span className="settings-me-text">
              <span className="settings-me-name">{ME.name}</span>
              <span className="base-meta settings-account-row-span">{ME.email}</span>
            </span>
          </button>
          {/* The plan: Free, with the way up (paywall.jsx). */}
          <button className="settings-plan" type="button" data-settings-plan={tier} data-px-scope onClick={() => (isPro ? setSection("plan") : openPw(tier === "trial" ? "annual" : undefined))}
           >
            {window.PxSky ? <window.PxSky variant="d" scene="promo" intensity={0.9} meadow={false} /> : null}
            <span className="settings-layer">
              <span className="base-row">
                <span className="px-display px-on-sky settings-px-calm" data-px-calm>Needt</span>
                {window.PxBadge ? <window.PxBadge>{tier === "lifetime" ? "Lifetime" : "Pro"}</window.PxBadge> : null}
              </span>
              <span className="settings-row-2">
                <span className="px-on-sky base-stack settings-px-calm-2" data-px-calm>
                  <span className="settings-srow-text">{tier === "free" ? "Free plan" : tierInfo.name}</span>
                  <span className="settings-text">
                    {tier === "free" ? PRc.trialDays + " days free · no card" : tier === "trial" ? "From " + PR.yearlyPerMonth + "/mo" : tier === "lifetime" ? "Pro for good." : tier === "yearly" ? PR.yearly + " / year" : PR.monthly + " / month"}</span>
                </span>
                {isPro ? null : <span className="nx-btn nx-btn-primary nx-btn-sm settings-btn">{tier === "trial" ? "See plans" : "Start trial"}</span>}
              </span>
            </span>
          </button>
          {NAV.map(([group, items]) => (
            <div className="base-stack settings-stack-2" key={group || items[0][0]}>
              {group ? <span className="settings-text-3">{group}</span> : null}
              {items.map(([id, name, icon, jump]) => {
                const on = !jump && section === id;
                return (
                  <button className="settings-row-4 settings-nav-row" key={id} type="button" data-settings-nav={id} data-settings-jump={jump || undefined}
                    onClick={() => (jump ? leaveTo(jump) : setSection(id))} aria-current={on ? "true" : undefined}
                    title={jump ? "Opens " + name + " — leaves Settings" : undefined}>
                    <span className="settings-row-5"><Icon name={icon} size={15} /></span>{name}
                    {jump ? <span className="settings-nav-out" aria-label="opens elsewhere"><Icon name="arrow-up-right" size={13} /></span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* right: one section, a hairline header, the close button */}
        <div className="settings-stack-3">
          <header className="settings-row-6">
            <h2 className="settings-text-4">{TITLES[section]}</h2>
            {saved ? (
              <span key={saved} className="saved-pop settings-saved-pop">
                <Icon name="check" size={12} />Saved
              </span>
            ) : null}
            <button className="settings-close-settings" type="button" aria-label="Close settings" onClick={onBack}
             >
              <Icon name="x" size={12} />
            </button>
          </header>

          <div id="settings-panel" key={section} className="settings-enter scroll-inner settings-enter-2">

            {section === "appearance" ? (
              <>
                <SGroup title="Theme" hint={theme === "time" ? "Follows the sun where you are: pale at dawn, Light by day, warm at golden hour, Dark after dusk." : "More themes are on the way."}>
                  <div className="settings-row-7">
                    {THEMES.map(([id, l]) => <ThemeTile key={id} id={id} label={l} active={theme === id} onPick={mark(onTheme)} pro={id === "time" ? tierInfo.pro : null} />)}
                  </div>
                  {theme === "time" ? <TimeNow day={day} /> : null}
                </SGroup>
                <SGroup title={<span className="settings-pro-title">Accent color{tierInfo.pro ? <SProPill /> : null}</span>}>
                  <AccentCard accent={accent} onAccent={mark(onAccent)} pro={tierInfo.pro} />
                </SGroup>
              </>
            ) : null}

            {section === "day" ? (
              <>
                {/* Working hours come first (08.10.26): they are what most
                    people open this section for. The scheduler's finer
                    options sit folded underneath. */}
                <SGroup title="Working hours" hint="Needt only plans work between these times.">
                  <SRow title="Day starts"><SSelect value={v.start} onChange={set("start")} options={HOURS} width={110} /></SRow>
                  <SRow title="Day ends"><SSelect value={v.end} onChange={set("end")} options={HOURS} width={110} /></SRow>
                  <SRow title="Week starts"><SSelect value={v.week} onChange={set("week")} options={[["mon", "Monday"], ["sun", "Sunday"]]} /></SRow>
                  <SRow title="Time zone"><SSelect value={v.tz} onChange={set("tz")} options={[["cet", "CET — Zürich"], ["utc", "UTC"], ["est", "EST — New York"]]} width={170} /></SRow>
                </SGroup>
                <SGroup title="Calendar">
                  <SRow title="Calendar opens in" desc="Week shows the grid; Agenda lists each day's events and tasks in order.">
                    <SSelect value={v.view === "days" ? "days" : "week"} onChange={set("view")} options={[["week", "Week"], ["days", "Agenda"]]} />
                  </SRow>
                </SGroup>
                <SGroup>
                  <SRow title="Planning options" desc={advOpen ? "How Needt fills your free time." : advSummary} onClick={() => setAdvOpen((o) => !o)} expanded={advOpen}
                    lead={<span className={"settings-adv-chev" + (advOpen ? " is-open" : "")}><Icon name="chevron-right" size={14} /></span>} />
                  {advOpen ? (
                    <>
                      <SRow title="Plan automatically" desc="Tasks without a time are placed into your free hours.">{sw("auto")}</SRow>
                      <SRow title={<span className="settings-pro-title">Plan my day puts first<SProPill locked={!tierInfo.pro} /></span>} desc="Which tasks get the earliest free time."><SSelect value={v.order} onChange={set("order")} options={[["deadline", "Nearest deadline"], ["short", "Shortest task"], ["project", "Same project together"]]} width={190} /></SRow>
                      <SRow title="Keep focus blocks free" desc="Nothing is placed inside a focus session.">{sw("protect")}</SRow>
                      <SRow title="Shortest work block" desc="A task is never split into pieces shorter than this."><SSelect value={v.chunk} onChange={set("chunk")} options={MIN([15, 30, 45, 60])} width={110} /></SRow>
                      <SRow title="Gap between tasks" desc="Free time left between two planned tasks."><SSelect value={v.buffer} onChange={set("buffer")} options={MIN([0, 5, 10, 15])} width={110} /></SRow>
                      <SRow title="Plan on weekends" desc="Off keeps Saturday and Sunday empty.">{sw("weekends")}</SRow>
                    </>
                  ) : null}
                </SGroup>
              </>
            ) : null}

            {section === "tasks" ? (
              <>
                <SGroup title="New tasks">
                  <SRow title="Default estimate"><SSelect value={v.est} onChange={set("est")} options={MIN([15, 30, 45, 60, 90])} width={110} /></SRow>
                  <SRow title="Default project"><SSelect value={v.project} onChange={set("project")} options={[["none", "No project"], ["resale", "Resale"], ["ops", "Operations"], ["ds", "Design system"]]} width={160} /></SRow>
                </SGroup>
                <SGroup title="Display">
                  <SRow title="Show subtasks" desc="Subtasks show as rows under their task, not folded away.">{sw("parts")}</SRow>
                  <SRow title="Task value" desc="Shows what a group of tasks earns you once all of them are done, e.g. CHF 840.">{sw("money")}</SRow>
                  <SRow title="Project activity" desc="A small flame beside a project grows with what you finished there lately; quiet projects show none.">
                    <span className="flame settings-flame" aria-hidden="true"><i /><i /><i /></span>
                  </SRow>
                </SGroup>
              </>
            ) : null}

            {section === "focus" ? (
              <>
                <SGroup title="Session">
                  <SRow title="Length"><SSelect value={v.len} onChange={set("len")} options={MIN([25, 50, 90])} width={110} /></SRow>
                  <SRow title="Break"><SSelect value={v.brk} onChange={set("brk")} options={MIN([5, 10, 15])} width={110} /></SRow>
                  <SRow title="Start sound"><SSelect value={v.sound} onChange={set("sound")} options={[["none", "Silent"], ["tick", "Tick"], ["chime", "Chime"]]} /></SRow>
                </SGroup>
                <SGroup title="While a session runs">
                  <SRow title="Hide notifications">{sw("hideAlerts")}</SRow>
                  <SRow title="Sound when a task snaps" desc="A short click as a dragged task lands on the quarter hour.">{sw("snapSound")}</SRow>
                  {/* Stored as stopMark (true = still); shown the way round people think of it. */}
                  <SRow title="Animate the logo" desc="The Needt logo moves gently during a session. Off keeps it still.">
                    <Switch checked={!v.stopMark} onChange={(x) => set("stopMark")(!x)} />
                  </SRow>
                </SGroup>
              </>
            ) : null}

            {section === "alerts" ? (
              <>
                <SGroup title="Daily plan" hint="Your day's planned tasks and events, sent before the day starts.">
                  <SRow title="Desktop notification">{sw("plan")}</SRow>
                  <SRow title="Email">{sw("mailPlan")}</SRow>
                  <SRow title="Time"><SSelect value={v.planTime} onChange={set("planTime")} options={HOURS} width={110} /></SRow>
                </SGroup>
                <SGroup title="Overdue tasks" hint="When a task passes its deadline and has no time yet.">
                  <SRow title="Desktop notification">{sw("nudge")}</SRow>
                </SGroup>
                <SGroup title="Weekly review" hint="Friday, after your last planned task — what got done and what carries over.">
                  <SRow title="Desktop notification">{sw("review")}</SRow>
                </SGroup>
              </>
            ) : null}

            {section === "keys" ? (
              (window.NEEDT_KEYS || []).map(([group, rows]) => (
                <SGroup key={group} title={group}>
                  {rows.map((r) => <SRow key={r.label} title={r.label}><span className="settings-row-9">{r.keys.map((k, j) => <Kbd key={j} k={k} />)}</span></SRow>)}
                </SGroup>
              ))
            ) : null}

            {section === "general" ? (
              <>
                <SGroup title="Links">
                  <SRow title="Open document links in" desc="Whether needt.app links open in the browser or the desktop app."><SSelect value={v.links} onChange={set("links")} options={[["ask", "Always ask"], ["web", "Browser"], ["app", "Desktop app"]]} /></SRow>
                </SGroup>
                <SGroup title="Offline">
                  <SRow title="Offline mode" desc="View and edit documents and tasks while offline. Changes sync when you are back.">{sw("offline")}</SRow>
                </SGroup>
              </>
            ) : null}

            {section === "data" ? (
              <>
                <SGroup title="Export" hint="Everything you have in Needt is yours to take with you.">
                  <SRow title="Tasks" desc="Every task with its project, estimate and dates."><SBtn icon="download">CSV</SBtn></SRow>
                  <SRow title="Documents" desc="One Markdown file per page."><SBtn icon="download">Markdown</SBtn></SRow>
                  <SRow title="Export all" desc="Tasks, documents, habits, boards and settings in one file."><SBtn icon="download">JSON</SBtn></SRow>
                </SGroup>
                <SGroup title="Import" menu>
                  <SRow title="Bring in your work" desc="Markdown, Notion, Google Docs, a calendar file (.ics) or a CSV of tasks.">
                    <DropdownMenu align="right" trigger={<SBtn icon="upload">Import…</SBtn>}>
                      {[["markdown", "Markdown files"], ["notion", "Notion export"], ["gdocs", "Google Docs"], ["ics", "Calendar file (.ics)"], ["csv", "CSV of tasks"]].map(([k, l]) => (
                        <MenuItem key={k} onClick={() => window.needtImport && window.needtImport(k)}>{l}</MenuItem>
                      ))}
                    </DropdownMenu>
                  </SRow>
                </SGroup>
                <SGroup title="Privacy">
                  <SRow title="Share usage data" desc="Anonymous counts of which features get used. Never the content of your tasks, documents or mail.">{sw("usage")}</SRow>
                </SGroup>
                <SGroup title="This device">
                  <SRow title="Download everything again" desc="Clears what this device keeps and fetches it fresh. Nothing is deleted."><SBtn>Download again</SBtn></SRow>
                  <SRow title="Reset prototype data" desc="Stars, trash, task and mail changes go back to the demo. The sidebar layout resets too."><SBtn tone="danger" onClick={() => { if (window.needtSync) window.needtSync.resetAll(); window.location.reload(); }}>Reset</SBtn></SRow>
                </SGroup>
              </>
            ) : null}

            {section === "account" ? (
              <>
                <SGroup title="Profile">
                  <div className="settings-row-10">
                    <span className="settings-span-6">
                      <span className="settings-grid">{ME.initials}</span>
                      <span className="settings-layer-2"><Icon name="camera" size={14} /></span>
                    </span>
                    <div className="settings-stack-4">
                      {[["Name", ME.name, "Visible on documents you share by link or email."], ["Email", ME.email, "Where we write to you, and one way to sign in."]].map(([l, val, h], i) => (
                        <div className="settings-row-11" key={l}>
                          <span className="settings-stack-5">
                            <span className="settings-text-5">{l}</span>
                            <span className="settings-text-6">{val}</span>
                            <span className="base-meta">{h}</span>
                          </span>
                          <IconButton label={"Edit " + l.toLowerCase()} variant="ghost"><Icon name="pencil" size={14} /></IconButton>
                        </div>
                      ))}
                    </div>
                  </div>
                </SGroup>
                <SGroup title="Sign-in methods">
                  <SRow title="Password" desc="Last changed in August."><SBtn>Change</SBtn></SRow>
                  <SRow title="Google" desc="maksym.k@gmail.com" lead={<span className="settings-signin-ico"><Icon name="chrome" size={14} /></span>}><SBtn>Disconnect</SBtn></SRow>
                  <SRow title="Apple" desc="Not set up" lead={<span className="settings-signin-ico"><Icon name="apple" size={14} /></span>}><SBtn>Connect</SBtn></SRow>
                </SGroup>
                <SGroup title="Devices">
                  <SRow title="This Mac" desc="Signed in since 12 August · now" />
                  <SRow title="iPhone" desc="Signed in since 3 September · yesterday"><SBtn>Sign out</SBtn></SRow>
                </SGroup>
                <SGroup>
                  <SRow title="Teams" desc="Share projects and documents with the people you work with, inside your Needt."
                    lead={<span className="settings-signin-ico"><Icon name="users" size={14} /></span>}>
                    <span className="settings-soon" data-settings-teams-soon>Coming soon</span>
                  </SRow>
                </SGroup>
                <SGroup>
                  <SRow title="Sign out" tone="link" onClick={onSignOut} />
                </SGroup>
                <SGroup title="Danger zone">
                  <SRow title="Delete account" tone="danger" desc="Your tasks, documents, habits and connections go at once. Export first under Data & privacy. This cannot be undone." onClick={() => {}} />
                </SGroup>
              </>
            ) : null}

            {section === "plan" ? (
              <>
                <SGroup>
                  <div className="settings-plan-card" data-settings-plan-card={tier}>
                    <span className="settings-row-12">
                      <span className="settings-stack-6">
                        <span className="settings-text-7">Your plan · {tierInfo.name}</span>
                        <span className="settings-text-8">
                          {tier === "free" ? PR.trialShort + "." : tierInfo.line}</span>
                      </span>
                      {tier === "free" ? <button type="button" className="nx-btn nx-btn-primary settings-btn" data-settings-trial onClick={() => openPw()}>{PR.trialCta}</button>
                        : tier === "trial" ? <button type="button" className="nx-btn nx-btn-primary settings-btn" onClick={() => openPw("annual")}>Choose a plan</button>
                        : tier === "lifetime" ? <span className="settings-text-9">{PR.lifetime} · paid once</span>
                        : null}
                    </span>
                    {tier === "free" ? (
                      <span className="settings-grid-2">
                        {[["Pro Monthly", PR.monthly + " / month", "Cancel any time", "monthly"],
                          ["Pro Yearly", PR.yearly + " / year", PR.yearlyPerMonth + "/mo · Save " + PR.saveAmount, "annual"],
                          ["Lifetime", PR.lifetime + " one-time", PR.lifetimeLeftLine, "lifetime"]].map(([n, p, sub, c]) => (
                          <button className="base-stack settings-price" key={c} type="button" data-settings-price={c} onClick={() => openPw(c)}
                           >
                            <span className="settings-text-10">{n}</span>
                            <span className="settings-text-11">{p}</span>
                            <span className={"settings-text-12" + (c === "annual" ? " is-save" : "")}>{sub}</span>
                          </button>
                        ))}
                      </span>
                    ) : tier === "trial" ? (
                      <span className="settings-row-13">
                        <span><b className="settings-b">{window.needtPlan ? window.needtPlan.trialDaysLeft : 9}</b> of <b className="settings-b">{PRc.trialDays}</b> trial days left</span>
                        <span className="settings-span-7"><span className="settings-bar" style={{ width: Math.round((window.needtPlan ? window.needtPlan.trialDaysLeft : 9) / PRc.trialDays * 100) + "%" }} /></span>
                      </span>
                    ) : tier === "lifetime" ? (
                      <span className="settings-span-8">
                        You&apos;re one of the first {PRc.lifetimeCap}. Every Pro feature, now and later — no renewals.</span>
                    ) : (
                      <span className="settings-span-8">
                        {tier === "yearly" ? "You save " + PR.saveAmount + " a year against monthly." : "Switch to yearly and pay " + PR.yearlyPerMonth + "/mo — save " + PR.saveAmount + " a year."}</span>
                    )}
                    {tier === "free" || tier === "trial" ? (
                      <span className="settings-trial-terms" data-settings-trial-terms>{TRIAL_TERMS}</span>
                    ) : null}
                    <span className={"settings-grid-3" + (tier === "lifetime" ? " is-one" : "")}>
                      {tier === "lifetime" ? null : <SBtn onClick={() => openPw(tier === "monthly" ? "annual" : undefined)}>{tier === "monthly" ? "Switch to yearly" : "Compare plans"}</SBtn>}
                      <SBtn>Invoices</SBtn>
                    </span>
                    <span className="base-meta">{PR.footnote}</span>
                  </div>
                </SGroup>
                <SGroup title={tierInfo.pro ? "Included in your plan" : "What Pro unlocks"}
                  hint={tierInfo.pro ? "Everything marked PRO across Needt." : "Each one is marked PRO where it lives. Try them all free for " + (PRc.trialDays || 14) + " days."}>
                  {PRO_FEATURES.map(([t, d]) => (
                    <SRow key={t} title={<span className="settings-pro-title">{t}<SProPill locked={!tierInfo.pro} /></span>} desc={d}
                      onClick={tierInfo.pro ? undefined : () => openPwFeature(t)}>
                      {tierInfo.pro ? <span className="settings-pro-on"><Icon name="check" size={13} />Included</span> : <Icon name="chevron-right" size={14} />}
                    </SRow>
                  ))}
                </SGroup>
                <SGroup title="Prototype" hint="Preview how Settings looks on each plan. Not part of the product.">
                  <SRow title="Plan state">
                    <span className="settings-plan-preview" data-settings-plan-preview>
                      <SSelect value={tier} onChange={setTier} width={190}
                        options={[["free", "Free"], ["trial", "Pro trial · 9 days left"], ["monthly", "Pro monthly"], ["yearly", "Pro yearly"], ["lifetime", "Lifetime"]]} />
                    </span>
                  </SRow>
                </SGroup>
                <SGroup title="Troubleshooting">
                  <SRow title="Billing is wrong" desc="Read what to check before writing to us." onClick={() => {}}><Icon name="chevron-right" size={14} /></SRow>
                  <SRow title="Report a billing issue" onClick={() => {}}><Icon name="chevron-right" size={14} /></SRow>
                  <SRow title="License key" desc="Got a key from us? Activate it here." onClick={() => {}}><Icon name="chevron-right" size={14} /></SRow>
                </SGroup>
              </>
            ) : null}

            {section === "about" ? (
              <>
                <SGroup>
                  <SRow title="Version" desc="Needt 0.9 · prototype">{null}</SRow>
                  <SRow title="What's new" onClick={() => {}}><Icon name="chevron-right" size={14} /></SRow>
                  <SRow title="Help centre" onClick={() => {}}><Icon name="external-link" size={14} /></SRow>
                  <SRow title="Terms and privacy" onClick={() => {}}><Icon name="external-link" size={14} /></SRow>
                </SGroup>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsScreen });
