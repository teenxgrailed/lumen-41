"use client";

import { type SomedayRow } from "@/lib/needt3/hooks/day-plan";

import { HaSheet } from "../../home/ha/HaSheet";
import { TaskGlyph } from "./TaskGlyph";

/**
 * The Someday list: each task with Return, which puts it back in the lists.
 * Same type and row geometry as the evening close.
 */
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
        className="ha-sheet dp-sheet"
        role="dialog"
        aria-label="Someday"
        data-someday=""
      >
        <div className="ha-grab" />
        <div className="dp-sh">
          <h3>Someday</h3>
          <span className="dp-sh-meta">
            {items.length ? `${items.length} saved for later` : ""}
          </span>
        </div>
        {items.length ? (
          items.map((t, i) => (
            <div
              key={t.id}
              className="dp-row dp-some dp-rise"
              style={{ "--i": Math.min(i, 6) } as React.CSSProperties}
              data-someday-row={t.id}
            >
              <div className="dp-row-t">
                <TaskGlyph title={t.title} size={16} />
                <b>{t.title}</b>
              </div>
              <button
                type="button"
                className="dp-ghost"
                data-someday-return={t.id}
                disabled={busy}
                onClick={() => onReturn(t.id)}
              >
                Return
              </button>
            </div>
          ))
        ) : (
          <p className="dp-quiet">{loading ? "Loading" : "Nothing here"}</p>
        )}
      </div>
    </HaSheet>
  );
}
