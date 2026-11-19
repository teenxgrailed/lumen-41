"use client";

import { type SomedayRow } from "@/lib/needt3/hooks/day-plan";

import { HaSheet } from "../../home/ha/HaSheet";

/** The Someday list: each task with Return, which puts it back in the lists. */
export function SomedaySheet({
  open,
  items,
  loading,
  busy,
  onReturn,
  onClose,
}: {
  open: boolean;
  items: readonly SomedayRow[];
  loading: boolean;
  busy: boolean;
  onReturn: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <HaSheet phone open={open} label="Someday" onClose={onClose}>
      <div
        className="ha-sheet"
        role="dialog"
        aria-label="Someday"
        data-someday=""
      >
        <div className="ha-grab" />
        <div className="ha-sheet-h">
          <h3>Someday</h3>
          <span className="ha-meta">
            {items.length ? `${items.length}` : ""}
          </span>
        </div>
        {items.length ? (
          items.map((t) => (
            <div key={t.id} className="ha-left" data-someday-row={t.id}>
              <div className="ha-left-t">
                <b>{t.title}</b>
              </div>
              <button
                type="button"
                className="ha-btn"
                data-someday-return={t.id}
                disabled={busy}
                onClick={() => onReturn(t.id)}
              >
                Return
              </button>
            </div>
          ))
        ) : (
          <p className="ha-meta">{loading ? "Loading" : "Nothing here"}</p>
        )}
      </div>
    </HaSheet>
  );
}
