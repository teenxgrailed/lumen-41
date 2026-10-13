"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { LuBug, LuX } from "react-icons/lu";

import { notify } from "@/lib/notifications";
import { getAppVersion } from "@/lib/version";

import { useNeedt3Ui } from "@/store/needt3-ui";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { Sheet } from "../ctx/Sheet";
import { type BugContext, bugFacts, bugFormData } from "./bug-report";

const T = strings["Bug.jsx"].BugSheet;

/**
 * Report a problem (prototype Bug.jsx): two questions, and what the app already
 * knows shown under them so nothing is sent unseen. Posts to the existing
 * `/api/bug-reports`.
 */
export function BugSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const route = usePathname() ?? "/";
  const theme = useNeedt3Ui((s) => s.theme);
  const [what, setWhat] = useState("");
  const [meant, setMeant] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState("");

  useEffect(() => {
    if (!open) return;
    setWhat("");
    setMeant("");
    setSent(false);
    setBusy(false);
    setSize(`${window.innerWidth} × ${window.innerHeight}`);
  }, [open]);

  const ctx: BugContext = {
    route,
    theme,
    window: size,
    version: getAppVersion(),
    browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };

  const send = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        body: bugFormData(what, meant, ctx),
      });
      if (!response.ok) throw new Error("Report failed");
      setSent(true);
    } catch {
      notify.error("Could not send the report. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={T.report_a_bug}
      scrimClassName="base-scrim nx-scrim"
      className="base-sheet nx-sheet shell-bug-sheet-arrive"
    >
      <header className="base-row shell-bug-sheet-row">
        <span className="shell-bug-sheet-grid" aria-hidden="true">
          <LuBug size={13} />
        </span>
        <span className="shell-help-sheet-text-2">{T.report_a_bug}</span>
        <button
          type="button"
          aria-label={T.close}
          onClick={onClose}
          className="nx-press base-close"
        >
          <LuX size={16} />
        </button>
      </header>
      {sent ? (
        <div className="shell-bug-sheet-stack">
          <span className="base-strong">{T.sent_thank_you}</span>
          <span className="base-meta-muted shell-day-menu-text">
            {T.it_arrived_with_the_screen_the_theme_and}
          </span>
        </div>
      ) : (
        <div className="scroll-inner shell-help-sheet-scroll-inner">
          <label className="shell-mini-month-stack">
            <span className="base-label">{T.what_happened}</span>
            <textarea
              className="shell-bug-sheet-textarea"
              autoFocus
              rows={3}
              maxLength={4000}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder={T.i_dragged_a_task_onto_thursday_and_it_la}
            />
          </label>
          <label className="shell-mini-month-stack">
            <span className="base-label">{T.what_you_expected}</span>
            <textarea
              className="shell-bug-sheet-textarea"
              rows={2}
              maxLength={2000}
              value={meant}
              onChange={(e) => setMeant(e.target.value)}
              placeholder={T.it_should_land_where_the_outline_was}
            />
          </label>
          <span className="shell-bug-sheet-stack-2">
            <span className="base-section-label">{T.sent_with_it}</span>
            <span className="shell-bug-sheet-row-2">
              {bugFacts(ctx).map(([k, v]) => (
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
          <span className="shell-bug-sheet-text-2">
            {T.goes_straight_to_the_developer}
          </span>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm"
            onClick={onClose}
          >
            {T.cancel}
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-primary nx-btn-sm"
            disabled={!what.trim() || busy}
            onClick={() => void send()}
          >
            {T.send_report}
          </button>
        </footer>
      )}
    </Sheet>
  );
}
