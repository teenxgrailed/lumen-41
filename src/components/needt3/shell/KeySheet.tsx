"use client";

import { Sheet } from "../ctx/Sheet";
import { KEY_GROUPS, SHELL_SHORTCUTS } from "./keys";

/** The Keyboard sheet reads the same table the handler does. */
export function KeySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Keyboard"
      scrimClassName="td-scrim"
      className="key-sheet"
      exitMs={0}
    >
      <header className="shell-key-sheet-row">
        <h2 className="shell-key-sheet-text">Keyboard</h2>
        <span className="base-meta-muted">
          Press ? anywhere to bring this back.
        </span>
        <span className="shell-key-sheet-text-2">esc to close</span>
      </header>
      <div className="scroll-inner shell-key-sheet-scroll-inner">
        {KEY_GROUPS.map((group) => (
          <section className="base-stack shell-key-sheet-stack" key={group}>
            <span className="base-section-label shell-key-sheet-span">
              {group}
            </span>
            {SHELL_SHORTCUTS.filter((r) => r.group === group).map((r) => (
              <span className="shell-key-sheet-row-2" key={r.label}>
                <span
                  className="shell-key-sheet-text-3"
                  style={{
                    color: r.quiet
                      ? "var(--text-muted)"
                      : "var(--text-primary)",
                  }}
                >
                  {r.label}
                </span>
                <span className="shell-key-sheet-row-3">
                  {r.keys.map((k, i) => (
                    <kbd key={i} className="key-cap">
                      {k}
                    </kbd>
                  ))}
                </span>
              </span>
            ))}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
