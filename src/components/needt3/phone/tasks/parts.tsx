"use client";

import { type CSSProperties, type ReactNode } from "react";

import { LuFolder } from "react-icons/lu";

import type { V3Project } from "@/lib/needt3/map";

import { projectHue } from "../../work/model";
import { PkButton, PkField, PkSheet, pkCx } from "../kit";
import { nameTaken } from "./model";
import { copy } from "./strings";

/** The five project colours, under the prototype's names (PTK_SWATCHES). */
const PTK_SWATCHES: readonly (readonly [string, string])[] = [
  ["Lavender", "var(--accent)"],
  ["Blue", "var(--info)"],
  ["Green", "var(--success)"],
  ["Red", "var(--destructive)"],
  ["Grey", "var(--text-muted)"],
];

/** The hue custom property the vendored ptk-* rules read. */
const hueStyle = (hue: string | undefined) =>
  ({ "--hue": hue }) as CSSProperties;

/** A thin bar; the fill is `transform: scaleX(--p)` (compositor only). */
export function PtkBar({ pct, hue }: { pct: number; hue?: string }) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <span className="ptk-bar" aria-hidden="true">
      <span
        className="ptk-bar-fill"
        style={{ "--p": p.toFixed(3), "--hue": hue } as CSSProperties}
      />
    </span>
  );
}

/** A small progress ring (stroke-dashoffset eases on change only). */
export function PtkRing({
  pct,
  hue,
  size = 28,
}: {
  pct: number;
  hue: string;
  size?: number;
}) {
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  const half = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="ptk-ring"
      aria-hidden="true"
      style={hueStyle(hue)}
    >
      <circle cx={half} cy={half} r={r} className="ptk-ring-track" />
      <circle
        cx={half}
        cy={half}
        r={r}
        className="ptk-ring-fill"
        strokeDasharray={c.toFixed(2)}
        strokeDashoffset={(c * (1 - pct)).toFixed(2)}
        transform={`rotate(-90 ${half} ${half})`}
      />
    </svg>
  );
}

/**
 * The project's colour tile.
 * //todo: `Project.icon` names a glyph; until an icon map exists every tile
 * draws the folder (the desktop's project page does the same).
 */
export function PtkTile({
  p,
  big,
}: {
  p: Pick<V3Project, "color">;
  big?: boolean;
}) {
  return (
    <span
      className={pkCx("ptk-tile", big && "is-big")}
      style={hueStyle(projectHue(p))}
      aria-hidden="true"
    >
      <LuFolder size={big ? 22 : 17} />
    </span>
  );
}

/** A long list shows its first `cap` rows and one quiet "Show N more". */
export const CAP_TASKS = 50;

export function cappedRows<T>(
  list: readonly T[],
  render: (item: T) => ReactNode,
  all: boolean,
  onMore: () => void,
  cap = CAP_TASKS
): ReactNode[] {
  const shown = all ? list : list.slice(0, cap);
  const out: ReactNode[] = shown.map(render);
  if (list.length > cap && !all)
    out.push(
      <button key="__more" type="button" className="ptk-more" onClick={onMore}>
        {copy.PtkCapped.show} {list.length - cap} more
      </button>
    );
  return out;
}

export interface ActionItem {
  id: string;
  icon: ReactNode;
  title: string;
  line?: string;
  danger?: boolean;
  onClick: () => void;
}

/** The project's ⋯ sheet: two actions, a line under each. */
export function PtkActions({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: readonly ActionItem[];
}) {
  return (
    <PkSheet
      open={open}
      onClose={onClose}
      title={title}
      label={copy.PtkActions.project_options}
      bodyClass="ptk-acts"
    >
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          className={pkCx("ptk-act", a.danger && "is-danger")}
          onClick={a.onClick}
          data-ptk-act={a.id}
        >
          <span className="ptk-act-icon">{a.icon}</span>
          <span className="ptk-act-main">
            <span className="ptk-act-title">{a.title}</span>
            {a.line ? <span className="ptk-act-line">{a.line}</span> : null}
          </span>
        </button>
      ))}
    </PkSheet>
  );
}

/**
 * Name and colour of a project; a name another project has is refused. What
 * is typed is held by the caller (`useWorkState`), not here, so it survives a
 * swap to the desktop face.
 */
export function PtkEditSheet({
  open,
  p,
  projects,
  values,
  onValues,
  onClose,
  onSave,
}: {
  open: boolean;
  p: V3Project | null;
  projects: readonly Pick<V3Project, "id" | "name">[];
  values: { name: string; color: string } | null;
  onValues: (v: { name: string; color: string }) => void;
  onClose: () => void;
  onSave: (v: { name: string; color: string }) => void;
}) {
  const name = values?.name ?? "";
  const hue = values?.color ?? PTK_SWATCHES[0][1];
  const clean = name.trim();
  const dupe = nameTaken(clean, projects, p?.id);
  const ok = !!clean && !dupe;
  const swatches: [string, string][] = PTK_SWATCHES.map(([k, v]) => [k, v]);
  if (p?.color && !swatches.some((s) => s[1] === p.color))
    swatches.unshift(["Current", p.color]);
  const save = () => {
    if (ok) onSave({ name: clean, color: hue });
  };
  const c = copy.PtkEditSheet;
  return (
    <PkSheet
      open={open}
      onClose={onClose}
      title={c.edit_project}
      label={c.edit_project}
      footer={
        <>
          <PkButton onClick={onClose}>{c.cancel}</PkButton>
          <PkButton kind="primary" disabled={!ok} onClick={save} data-ptk-save>
            {c.save}
          </PkButton>
        </>
      }
    >
      <div className="ptk-edit">
        <PkField
          label={c.name}
          id="ptk-edit-name"
          value={name}
          onChange={(n) => onValues({ name: n, color: hue })}
          placeholder={c.project_name}
          inputProps={{
            enterKeyHint: "done",
            autoComplete: "off",
            "aria-invalid": dupe || undefined,
            "aria-describedby": dupe ? "ptk-edit-err" : undefined,
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            },
            ...({ "data-ptk-edit-name": "" } as object),
          }}
        />
        {dupe ? (
          <p className="ptk-edit-err" id="ptk-edit-err" role="alert">
            {c.a_project_with_this_name_exists}
          </p>
        ) : null}
        <div className="ptk-edit-colours">
          <span className="pk-label">{c.colour}</span>
          <div className="ptk-swatches" role="radiogroup" aria-label={c.colour}>
            {swatches.map(([label, v]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={hue === v}
                aria-label={label}
                className={pkCx("ptk-swatch", hue === v && "is-on")}
                style={hueStyle(v)}
                onClick={() => onValues({ name, color: v })}
              />
            ))}
          </div>
        </div>
      </div>
    </PkSheet>
  );
}
