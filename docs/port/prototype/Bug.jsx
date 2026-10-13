/* REPORT BUG — a report the developer can act on, gathered without asking.
 *
 * Most bug forms ask the person to describe a state the app already knows:
 * which screen, which theme, which view, what browser. So this one states all
 * of that back and asks only the two things it cannot know — what happened,
 * and what was supposed to happen. Everything below the line is collected and
 * shown, so nothing is sent that was not seen.
 *
 * The red belongs to the entry in the menu, not to this sheet: reporting a
 * fault is a favour to the product, not a destructive act, and a red panel
 * would make the reporter feel like the fault. */
function BugSheet({ open, onClose }) {
  const { Icon, IconButton, Button, Input } = window.NeedtDesignSystem_25d3c8;
  const [what, setWhat] = React.useState("");
  const [meant, setMeant] = React.useState("");
  const [sent, setSent] = React.useState(false);
  React.useEffect(() => { if (open) { setWhat(""); setMeant(""); setSent(false); } }, [open]);
  if (!open) return null;

  /* What the app knows about itself at the moment the report is opened. */
  const app = window.__app || {};
  const root = document.querySelector(".app");
  const theme = root ? (["paper", "dim", "dark", "system"].filter((t) => root.classList.contains(t))[0] || "paper") : "—";
  const facts = [
    ["Screen", (app.screen || document.querySelector("[data-screen-label]") ? (app.screen || "today") : "today")],
    ["Theme", theme],
    ["Window", window.innerWidth + " × " + window.innerHeight],
    ["Version", "kit · " + new Date().toISOString().slice(0, 10)]
  ];

  return (
    <div className="co-scrim shell-help-sheet-scrim" onMouseDown={onClose}
     >
      <div onMouseDown={(e) => e.stopPropagation()} className="co-arrive base-sheet shell-bug-sheet-arrive"
       >
        <header className="base-row shell-bug-sheet-row">
          <span className="shell-bug-sheet-grid" aria-hidden="true">
            <Icon name="bug" size={13} />
          </span>
          <span className="shell-help-sheet-text-2">Report a bug</span>
          <IconButton label="Close" variant="ghost" onClick={onClose}><Icon name="x" size={16} /></IconButton>
        </header>

        {sent ? (
          <div className="shell-bug-sheet-stack">
            <span className="base-strong">Sent. Thank you.</span>
            <span className="base-meta-muted shell-day-menu-text">
              It arrived with the screen, the theme and the window size attached, so nobody has to ask you for them.
            </span>
          </div>
        ) : (
          <div className="scroll-inner shell-help-sheet-scroll-inner">
            {/* Two questions, because the other six answer themselves. */}
            <label className="shell-mini-month-stack">
              <span className="base-label">What happened</span>
              <textarea className="shell-bug-sheet-textarea" autoFocus value={what} rows={3} onChange={(e) => setWhat(e.target.value)}
                placeholder="I dragged a task onto Thursday and it landed on Wednesday."
                />
            </label>
            <label className="shell-mini-month-stack">
              <span className="base-label">What you expected</span>
              <Input value={meant} onChange={(e) => setMeant(e.target.value)} placeholder="It should land where the outline was." />
            </label>

            {/* Collected, and shown — nothing is sent that was not seen. */}
            <span className="shell-bug-sheet-stack-2">
              <span className="base-section-label">
                Sent with it
              </span>
              <span className="shell-bug-sheet-row-2">
                {facts.map(([k, v]) => (
                  <span className="shell-bug-sheet-row-3" key={k}>
                    <span className="shell-bug-sheet-text">{k}</span>
                    <span className="base-label">{v}</span>
                  </span>
                ))}
              </span>
            </span>
          </div>
        )}

        {sent ? null : (
          <footer className="base-row shell-bug-sheet-row-4">
            <span className="shell-bug-sheet-text-2">Goes straight to the developer.</span>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={!what.trim()} onClick={() => setSent(true)}>Send report</Button>
          </footer>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { BugSheet });
