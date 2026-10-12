"use client";

/* REPORT BUG — a report the developer can act on, gathered without asking.
 * Ported from `Bug.jsx`.
 *
 * Most bug forms ask the person to describe a state the app already knows:
 * which screen, which theme, which window size. So this one states all of
 * that back and asks only the two things it cannot know — what happened, and
 * what was supposed to happen. Everything below the line is collected and
 * shown, so nothing is sent that was not seen.
 *
 * The kit read `window.__app` and the root element's class list for the
 * screen and the theme. This component has no shell to reach into — it is
 * it takes no route of its own — so the caller, which
 * does have that context, hands the two facts in as props instead of this
 * file reaching for a global.
 *
 * The red belongs to the entry in the menu, not to this sheet: reporting a
 * fault is a favour to the product, not a destructive act, and a red panel
 * would make the reporter feel like the fault.
 */
import * as React from "react";

import { LuBug, LuX } from "react-icons/lu";

import { newDate, toLocalDateKey } from "@/lib/date-utils";

import { Glyph, IconButton } from "../shell/chrome";

export interface BugReport {
  what: string;
  expected: string;
  facts: ReadonlyArray<readonly [string, string]>;
}

export interface BugSheetProps {
  open: boolean;
  onClose: () => void;
  /** What the shell calls the screen underneath, e.g. "Home". */
  screen: string;
  /** The active theme's name, e.g. "paper". */
  theme: string;
  /** Fires once, when "Send report" is pressed. Sending is not built yet
      (PORT.md §9) — the caller decides what "sent" means. */
  onSend?: (report: BugReport) => void;
}

export function BugSheet({
  open,
  onClose,
  screen,
  theme,
  onSend,
}: BugSheetProps) {
  const [what, setWhat] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [windowSize, setWindowSize] = React.useState<string>("—");

  React.useEffect(() => {
    if (!open) return;
    setWhat("");
    setExpected("");
    setSent(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setWindowSize(`${window.innerWidth} × ${window.innerHeight}`);
  }, [open]);

  if (!open) return null;

  const facts: ReadonlyArray<readonly [string, string]> = [
    ["Screen", screen],
    ["Theme", theme],
    ["Window", windowSize],
    ["Date", toLocalDateKey(newDate())],
  ];

  function send() {
    onSend?.({ what, expected, facts });
    setSent(true);
  }

  return (
    <div
      className="co-scrim"
      onMouseDown={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        className="co-arrive"
        role="dialog"
        aria-modal="true"
        aria-label="Report a bug"
        style={{
          display: "flex",
          flexDirection: "column",
          width: "min(460px, 100%)",
          maxHeight: "100%",
          borderRadius: "var(--radius-2xl)",
          background: "var(--surface-raised)",
          boxShadow: "var(--shadow-floating)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 46,
            padding: "0 11px 0 16px",
            flex: "none",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "grid",
              placeItems: "center",
              width: 22,
              height: 22,
              borderRadius: "var(--radius-xs)",
              color: "var(--destructive)",
              background: "var(--fill-destructive)",
            }}
          >
            <Glyph of={LuBug} size={13} />
          </span>
          <span
            style={{
              flex: 1,
              font: "var(--type-card-title)",
              color: "var(--text-primary)",
            }}
          >
            Report a bug
          </span>
          <IconButton
            label="Close"
            variant="ghost"
            onClick={onClose}
            icon={<Glyph of={LuX} size={16} />}
          />
        </header>

        {sent ? (
          <div
            style={{
              padding: "4px 16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span
              style={{
                font: "var(--type-ui-medium)",
                color: "var(--text-primary)",
              }}
            >
              Sent. Thank you.
            </span>
            <span
              style={{
                font: "var(--type-meta)",
                color: "var(--text-muted)",
                textWrap: "pretty",
              }}
            >
              It arrived with the screen, the theme and the window size
              attached, so nobody has to ask you for them.
            </span>
          </div>
        ) : (
          <div
            className="scroll-inner"
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: "0 16px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Two questions, because the other four answer themselves. */}
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span
                style={{
                  font: "var(--type-meta-medium)",
                  color: "var(--text-secondary)",
                }}
              >
                What happened
              </span>
              <textarea
                autoFocus
                className="nt-input"
                value={what}
                rows={3}
                onChange={(event) => setWhat(event.target.value)}
                placeholder="I dragged a task onto Thursday and it landed on Wednesday."
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span
                style={{
                  font: "var(--type-meta-medium)",
                  color: "var(--text-secondary)",
                }}
              >
                What you expected
              </span>
              <input
                className="nt-input"
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                placeholder="It should land where the outline was."
              />
            </label>

            {/* Collected, and shown — nothing is sent that was not seen. */}
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                paddingTop: 2,
              }}
            >
              <span
                style={{
                  font: "var(--type-meta-medium)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--text-quaternary)",
                }}
              >
                Sent with it
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {facts.map(([k, v]) => (
                  <span
                    key={k}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      height: 24,
                      padding: "0 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--fill-2)",
                      boxShadow: "var(--shadow-inset-ring)",
                    }}
                  >
                    <span
                      style={{
                        font: "var(--type-meta)",
                        color: "var(--text-quaternary)",
                      }}
                    >
                      {k}
                    </span>
                    <span
                      style={{
                        font: "var(--type-meta-medium)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {v}
                    </span>
                  </span>
                ))}
              </span>
            </span>
          </div>
        )}

        {sent ? null : (
          <footer
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 16px 16px",
              flex: "none",
            }}
          >
            <span
              style={{
                flex: 1,
                font: "var(--type-meta)",
                color: "var(--text-disabled)",
              }}
            >
              Goes straight to the developer.
            </span>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={!what.trim()}
              onClick={send}
            >
              Send report
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
