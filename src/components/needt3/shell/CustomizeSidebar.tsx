"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { LuCheck, LuGripVertical, LuX } from "react-icons/lu";

import { Sheet } from "../ctx/Sheet";
import { Art, type ArtName } from "../menu/Art";
import {
  DEFAULT_PREFS,
  PLACES,
  SECTIONS,
  moveRow,
  placeById,
  toggleRow,
} from "./places";
import { useSidebarPrefs } from "./useSidebarPrefs";

function Check({ on, onClick }: { on: boolean; onClick: () => void }) {
  // .nx-check[aria-pressed] drives the tick animation in the vendored CSS.
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className="nx-check shell-sk-check-check"
      style={{
        background: on ? "var(--accent)" : "transparent",
        boxShadow: on
          ? "none"
          : "color-mix(in oklab, var(--text-primary) 22%, transparent) 0 0 0 1.5px inset",
      }}
      aria-pressed={on}
    >
      {on ? <LuCheck size={14} /> : null}
    </button>
  );
}

/** Drag to reorder: the list reorders live under the cursor and every row
 *  slides to its new place (FLIP, 200 ms). */
function List({
  rows,
  label,
  art,
  onToggle,
  onMove,
}: {
  rows: { id: string; on: boolean }[];
  label: (id: string) => string;
  art?: (id: string) => ArtName;
  onToggle: (id: string) => void;
  onMove: (from: string, to: string) => void;
}) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const last = useRef<Record<string, number>>({});
  const [drag, setDrag] = useState<string | null>(null);
  useLayoutEffect(() => {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    rows.forEach((r) => {
      const el = refs.current[r.id];
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const was = last.current[r.id];
      if (!reduced && was != null && was !== top) {
        el.style.transition = "none";
        el.style.transform = `translateY(${was - top}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 200ms var(--nx-ease)";
          el.style.transform = "";
        });
      }
      last.current[r.id] = top;
    });
  });
  return (
    <div className="shell-sk-list-stack">
      {rows.map((r, i) => (
        <div
          className="shell-sk-list-row"
          key={r.id}
          ref={(el) => {
            refs.current[r.id] = el;
          }}
          draggable
          onDragStart={(e) => {
            setDrag(r.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(e) => {
            e.preventDefault();
            if (drag && drag !== r.id) onMove(drag, r.id);
          }}
          style={{ opacity: drag === r.id ? 0.5 : 1 }}
        >
          <span className="shell-sk-list-row-2">
            <LuGripVertical size={16} />
          </span>
          {art ? <Art name={art(r.id)} size={22} /> : null}
          <span
            className="shell-sk-list-text"
            style={{
              color: r.on ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            {label(r.id)}
          </span>
          <Check on={r.on} onClick={() => onToggle(r.id)} />
          {i < rows.length - 1 ? (
            <span className="shell-sk-list-layer" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Reorder or hide places and sections. Hidden places move into More. */
export function CustomizeSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useSidebarPrefs();
  const tiles = prefs.places.filter((p) => p.on).length;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Customize Sidebar"
      scrimClassName="base-scrim nx-scrim"
      className="shell-customize-sidebar-customize-sidebar nx-sheet"
    >
      <header className="shell-customize-sidebar-row">
        <h2 className="shell-customize-sidebar-text">Customize Sidebar</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="nx-press base-close shell-sidebar-toggle-text"
        >
          <LuX size={13} />
        </button>
      </header>
      <p className="shell-customize-sidebar-text-2">
        Reorder or hide places and sections. Hidden places move into More.
      </p>
      <div className="shell-customize-sidebar-row-2">
        <span className="shell-customize-sidebar-text-3">Places</span>
        <span className="base-meta-muted">
          {tiles} as tiles · {PLACES.length - tiles} in More
        </span>
      </div>
      <List
        rows={prefs.places}
        label={(id) => placeById(id)?.label ?? id}
        art={(id) => placeById(id)?.art ?? "page"}
        onToggle={(id) => void setPrefs((s) => toggleRow(s, "places", id))}
        onMove={(a, b) => void setPrefs((s) => moveRow(s, "places", a, b))}
      />
      <span className="shell-customize-sidebar-text-4">Sections</span>
      <List
        rows={prefs.sections}
        label={(id) => SECTIONS.find((s) => s.id === id)?.label ?? id}
        onToggle={(id) => void setPrefs((s) => toggleRow(s, "sections", id))}
        onMove={(a, b) => void setPrefs((s) => moveRow(s, "sections", a, b))}
      />
      <button
        className="shell-customize-sidebar-button"
        type="button"
        onClick={() => void setPrefs(() => DEFAULT_PREFS)}
      >
        Reset to default
      </button>
    </Sheet>
  );
}
