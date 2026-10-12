/* NOTIFICATIONS — what the app did, stacked over the place you would ask.
 *
 * The island says one thing by BECOMING the thing: the pill swells, speaks,
 * shrinks. That works for a hint nobody has to keep. A notification is the
 * other case — something actually happened, it may need an answer, and it has
 * to survive long enough to be read and acted on. So it is a card, it stacks,
 * and it waits.
 *
 * They live directly above the chat pill rather than at the top of the
 * screen, because that corner is already where this product speaks from: the
 * island, the panel and these are three registers of one voice coming from
 * one place. A notice in the opposite corner would be a fourth stranger.
 *
 * THE STACK. Newest at the bottom, nearest the pill, because that is where the
 * eye already is. Older ones are pushed up, and past the third they are
 * folded: scaled down and dimmed behind the ones in front, so five arrivals
 * cost the same screen as three. A list that grows without limit is a list
 * that covers the work.
 */
const NfNS = window.NeedtDesignSystem_25d3c8;
const { Icon: NfIcon, Button: NfButton, IconButton: NfIconButton } = NfNS;

const NF_KIND = {
  placed:  { glyph: "calendar-check", tone: "var(--accent)" },
  moved:   { glyph: "move-right", tone: "var(--accent)" },
  risk:    { glyph: "triangle-alert", tone: "var(--destructive)" },
  done:    { glyph: "check", tone: "var(--success)" },
  agent:   { glyph: "sparkles", tone: "var(--accent)" },
  person:  { glyph: "user", tone: "var(--info)" },
  blocked: { glyph: "link", tone: "var(--destructive)" }
};

function NfCard({ n, depth, onAct, onClose }) {
  const k = NF_KIND[n.kind] || NF_KIND.agent;
  /* Depth is how far back in the stack it is: each step loses a little size
     and a little light, which is what makes a stack read as a stack rather
     than as a column of equals. */
  const back = Math.min(depth, 3);
  return (
    <div className={"nf-card" + (n.leaving ? " is-out" : "")}
      style={{ order: -depth, transform: "scale(" + (1 - back * 0.035) + ")", opacity: 1 - back * 0.22,
        pointerEvents: back > 2 ? "none" : "auto" }}>
      <div className="shell-nf-card-row">
        <span className="shell-nf-card-grid" aria-hidden="true" style={{ color: k.tone, background: "color-mix(in oklab, " + k.tone + " 15%, transparent)" }}>
          <NfIcon name={k.glyph} size={15} />
        </span>
        <span className="base-stack shell-nf-card-stack">
          <span className="shell-nf-card-row-2">
            <span className="base-strong shell-nf-card-span">{n.title}</span>
            <span className="shell-nf-card-text">{n.when || "now"}</span>
          </span>
          <span className="base-meta shell-day-menu-text">{n.body}</span>
          {n.acts && n.acts.length ? (
            <span className="shell-nf-card-row-3">
              {n.acts.map((a, i) => (
                <NfButton key={a.label} size="sm" variant={i === 0 ? "flat" : "ghost"}
                  onClick={() => onAct(n, a)}>{a.label}</NfButton>
              ))}
            </span>
          ) : null}
        </span>
        <span className="nf-x">
          <NfIconButton label="Dismiss" variant="ghost" size="sm" onClick={() => onClose(n.id)}>
            <NfIcon name="x" size={13} />
          </NfIconButton>
        </span>
      </div>
    </div>
  );
}

function Notifications({ hidden }) {
  const [list, setList] = React.useState([]);
  const held = React.useRef(false);
  const timers = React.useRef({});

  function drop(id) {
    /* Leave first, then go: a card that disappears on the frame you click it
       leaves the stack jumping, and you cannot tell which one left. */
    setList((l) => l.map((n) => (n.id === id ? Object.assign({}, n, { leaving: true }) : n)));
    window.setTimeout(() => setList((l) => l.filter((n) => n.id !== id)), 220);
    if (timers.current[id]) { window.clearTimeout(timers.current[id]); delete timers.current[id]; }
  }

  React.useEffect(() => {
    window.__notify = function (n) {
      const id = "n" + Date.now() + Math.random().toString(36).slice(2, 6);
      const item = Object.assign({ id: id }, n);
      setList((l) => l.concat([item]).slice(-5));
      if (n.sticky) return id;
      /* Long enough to read two lines and reach a button; hovering the stack
         stops the clock, because reaching for a card is the clearest possible
         statement that you are not finished with it. */
      timers.current[id] = window.setTimeout(function tick() {
        if (held.current) { timers.current[id] = window.setTimeout(tick, 1200); return; }
        drop(id);
      }, n.ms || 7000);
      return id;
    };
    return () => { delete window.__notify; };
  }, []);

  React.useEffect(() => () => {
    Object.keys(timers.current).forEach((k) => window.clearTimeout(timers.current[k]));
  }, []);

  function act(n, a) {
    drop(n.id);
    if (a.say && window.__agent) {
      if (a.say === "plan") {
        window.__agent.run([
          { sel: "[data-agent-queue] article", act: "hold", say: "Taking what has no time yet", title: n.holding || "Finish the tank graphic" },
          { sel: "[data-drop=\"timeline\"][data-date=\"1\"]", act: "drop", say: "Into the stretch that opened" }
        ]);
      }
      if (a.say === "focus") window.__agent.run([{ sel: "[data-drop=focus] button", act: "click", say: "Starting a focus session" }]);
    }
    if (a.go && window.__go) window.__go(a.go);
  }

  if (hidden || !list.length) return null;
  const shown = list.slice(-4);
  return (
    <div className="nf-stack"
      onMouseEnter={() => { held.current = true; }}
      onMouseLeave={() => { held.current = false; }}>
      {shown.map((n, i) => (
        <NfCard key={n.id} n={n} depth={shown.length - 1 - i} onAct={act} onClose={drop} />
      ))}
    </div>
  );
}

Object.assign(window, { Notifications, NF_KIND });
