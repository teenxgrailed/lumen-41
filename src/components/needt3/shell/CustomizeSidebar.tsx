"use client";

import { LuCheck, LuGripVertical, LuX } from "react-icons/lu";

import { Sheet } from "../ctx/Sheet";
import { Art, type ArtName } from "../menu/Art";
import { SortableItem, SortableList } from "../sortable/Sortable";
import { useSortableList } from "../sortable/useSortableList";
import {
  DEFAULT_PREFS,
  PLACES,
  SECTIONS,
  orderRows,
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

/** Drag the grip to reorder (the shared sortable list): the row follows the
 *  pointer, the others slide away, Space and the arrows do the same. */
function List({
  rows,
  label,
  art,
  onToggle,
  onOrder,
}: {
  rows: { id: string; on: boolean }[];
  label: (id: string) => string;
  art?: (id: string) => ArtName;
  onToggle: (id: string) => void;
  onOrder: (order: string[]) => Promise<unknown>;
}) {
  const ctl = useSortableList({
    items: rows,
    label: (r) => label(r.id),
    onReorder: onOrder,
  });
  return (
    <SortableList ctl={ctl}>
      <div className="shell-sk-list-stack">
        {ctl.ordered.map((r, i) => (
          <SortableItem
            key={r.id}
            id={r.id}
            label={label(r.id)}
            className="shell-sk-list-row"
          >
            {({ handleProps }) => (
              <>
                <span
                  {...handleProps}
                  className="shell-sk-list-row-2 nx-sort-grip"
                >
                  <LuGripVertical size={16} />
                </span>
                {art ? <Art name={art(r.id)} size={22} /> : null}
                <span
                  className="shell-sk-list-text"
                  style={{
                    color: r.on
                      ? "var(--text-primary)"
                      : "var(--text-tertiary)",
                  }}
                >
                  {label(r.id)}
                </span>
                <Check on={r.on} onClick={() => onToggle(r.id)} />
                {i < ctl.ordered.length - 1 ? (
                  <span className="shell-sk-list-layer" aria-hidden="true" />
                ) : null}
              </>
            )}
          </SortableItem>
        ))}
      </div>
    </SortableList>
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
  const [prefs, setPrefs, defaults = DEFAULT_PREFS] = useSidebarPrefs();
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
        onOrder={(order) =>
          setPrefs((s) => orderRows(s, "places", order), { rethrow: true })
        }
      />
      <span className="shell-customize-sidebar-text-4">Sections</span>
      <List
        rows={prefs.sections}
        label={(id) => SECTIONS.find((s) => s.id === id)?.label ?? id}
        onToggle={(id) => void setPrefs((s) => toggleRow(s, "sections", id))}
        onOrder={(order) =>
          setPrefs((s) => orderRows(s, "sections", order), { rethrow: true })
        }
      />
      <button
        className="shell-customize-sidebar-button"
        type="button"
        onClick={() => void setPrefs(() => defaults)}
      >
        Reset to default
      </button>
    </Sheet>
  );
}
