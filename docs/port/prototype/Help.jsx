/* GET HELP — how the product works, in the product.
 *
 * Not a FAQ and not a tour: the four things a person cannot guess, because
 * each one is a convention this product invented. A rail that means movability,
 * a line you type instead of a form, a gap that offers two minutes, a square
 * per day that never becomes a debt. Everything else in the interface explains
 * itself by being looked at.
 *
 * Each entry is written as a rule with its own example, so it can be read in
 * ten seconds and remembered as one sentence. */
const HELP = [
  ["The rail", "circle", [
    ["A grey edge means you pinned it", "The scheduler will not move a block with a grey edge, however tight the day gets."],
    ["A coloured edge means it may move", "The scheduler placed it and can place it again — that is what the colour is telling you."],
    ["No edge at all means it has no slot", "A resale item closes when it closes. There is nothing to move, so it takes no place in the day."]
  ]],
  ["The line", "type", [
    ["Type the task, not a form", "“ship the boots tomorrow 3pm for 30 min #resale urgent” makes all of it at once."],
    ["What it understood turns into a chip", "Each chip can be cleared on its own. What it did not understand stays as the title."],
    ["A slash opens the rest", "Press / for description, parts, deadline, repeat, labels — the things a sentence cannot say."]
  ]],
  ["The day", "calendar-days", [
    ["Short gaps offer two minutes", "Any stretch under fifteen minutes shows its length and offers the entries that fit it."],
    ["An entry is the first step, not the task", "It is what you press when you do not have time to start properly."],
    ["Plan my day fills the free hours", "It respects pinned blocks, your working hours and the buffers you set."]
  ]],
  ["Habits", "repeat", [
    ["A square a day, and a miss stays empty", "It never turns into a debt or an overdue task — that is the whole point of the shelf."],
    ["The count is out of the last fourteen days", "A streak punishes one miss with total loss, which is why streaks get abandoned."],
    ["A habit with a time is a standing block", "It holds its hour, so the planner builds the rest of the day around it."]
  ]]
];

function HelpSheet({ open, onClose }) {
  const { Icon, IconButton } = window.NeedtDesignSystem_25d3c8;
  const [at, setAt] = React.useState(0);
  if (!open) return null;
  const [title, glyph, rules] = HELP[at];
  return (
    <div className="co-scrim shell-help-sheet-scrim" onMouseDown={onClose}
     >
      <div onMouseDown={(e) => e.stopPropagation()} className="co-arrive base-sheet shell-help-sheet-arrive"
       >
        {/* Four conventions down the side: the list is short enough to be the
            navigation and the table of contents at once. */}
        <nav className="base-stack shell-help-sheet-stack">
          <span className="base-section-label shell-help-sheet-span">
            How it works
          </span>
          {HELP.map(([t, g], i) => (
            <button className="base-row shell-help-sheet-row" key={t} type="button" onClick={() => setAt(i)}
              style={{ background: i === at ? "var(--fill-accent)" : "transparent", color: i === at ? "var(--accent)" : "var(--text-secondary)" }}>
              <Icon name={g} size={14} />
              <span className="shell-help-sheet-text">{t}</span>
            </button>
          ))}
        </nav>
        <div className="shell-help-sheet-stack-2">
          <header className="base-row shell-help-sheet-row-2">
            <span className="shell-help-sheet-text-2">{title}</span>
            <IconButton label="Close" variant="ghost" onClick={onClose}><Icon name="x" size={16} /></IconButton>
          </header>
          <div className="scroll-inner shell-help-sheet-scroll-inner">
            {rules.map(([rule, why]) => (
              <span className="base-stack" key={rule}>
                <span className="base-strong shell-day-menu-text">{rule}</span>
                <span className="base-meta-muted shell-day-menu-text">{why}</span>
              </span>
            ))}
            <span className="base-row shell-day-menu-span">
              <button className="base-label shell-help-sheet-row-3" type="button" onClick={() => { onClose(); if (window.__app) window.__app.setKeysOpen(true); }}
               >
                <Icon name="keyboard" size={13} />Keyboard shortcuts
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HelpSheet, HELP });
