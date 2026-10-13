"use client";

import { useEffect, useState } from "react";

import type { V3Project } from "@/lib/needt3/map";

import { Sheet } from "../ctx/Sheet";
import { PROJECT_SWATCHES, nameTaken } from "./model";

/**
 * New Project ($P/work.jsx NewProjectSheet): a name and one of five
 * colours. The same sheet edits a project (`initial` + `title` + `cta`).
 */
export function ProjectSheet({
  open,
  onClose,
  onSave,
  projects,
  initial,
  title = "New project",
  cta = "Create",
  values,
  onValues,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: { name: string; color: string }) => void;
  projects: readonly Pick<V3Project, "id" | "name">[];
  initial?: Pick<V3Project, "id" | "name" | "color"> | null;
  title?: string;
  cta?: string;
  /**
   * What the sheet shows, held by the caller (WorkScreen keeps it above the
   * phone / desktop switch so a half-typed edit survives a resize). Without it
   * the sheet keeps its own, seeded from `initial` each time it opens.
   */
  values?: { name: string; color: string } | null;
  onValues?: (v: { name: string; color: string }) => void;
}) {
  const [ownName, setOwnName] = useState("");
  const [ownHue, setOwnHue] = useState<string>(PROJECT_SWATCHES[0][1]);
  const held = !!values && !!onValues;
  useEffect(() => {
    if (!open || held) return;
    setOwnName(initial?.name ?? "");
    setOwnHue(initial?.color ?? PROJECT_SWATCHES[0][1]);
  }, [open, initial, held]);
  const name = held ? values.name : ownName;
  const hue = held ? values.color : ownHue;
  const setName = (n: string) =>
    held ? onValues({ ...values, name: n }) : setOwnName(n);
  const setHue = (c: string) =>
    held ? onValues({ ...values, color: c }) : setOwnHue(c);

  const clean = name.trim();
  const dupe = nameTaken(clean, projects, initial?.id);
  const ok = !!clean && !dupe;
  const go = () => {
    if (ok) onSave({ name: clean, color: hue });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      scrimClassName="nx-scrim wk-scrim"
      className="nx-sheet wk-sheet"
    >
      <span className="wk-sheet-title">{title}</span>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        aria-label="Project name"
        onKeyDown={(e) => {
          if (e.key === "Enter") go();
        }}
        className="wk-sheet-input"
      />
      <div className="wk-sheet-row">
        <span className="wk-sheet-label">Colour</span>
        {PROJECT_SWATCHES.map(([k, v]) => (
          <button
            key={k}
            type="button"
            aria-label={k}
            aria-pressed={hue === v}
            onClick={() => setHue(v)}
            className="nx-press wk-swatch"
            style={{
              background: v,
              boxShadow:
                hue === v
                  ? `var(--surface-raised) 0 0 0 2px, ${v} 0 0 0 4px`
                  : undefined,
            }}
          />
        ))}
      </div>
      {dupe ? (
        <span className="wk-sheet-error">A project with this name exists.</span>
      ) : null}
      <div className="wk-sheet-acts">
        <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-primary wk-create"
          disabled={!ok}
          onClick={go}
        >
          {cta}
        </button>
      </div>
    </Sheet>
  );
}
