"use client";

import { useEffect, useState } from "react";

import { cadenceLabel, minutesLabel } from "@/lib/starter-game";

import { SgOrb } from "./SgOrb";
import {
  EDITOR_HORIZONS,
  EDITOR_MINUTES,
  EDITOR_PER_WEEK,
  type SgTile,
  detailLabel,
} from "./board";
import { SG_GROUPS, sgGroup } from "./model";

/**
 * THE TILE EDITOR (sg-game.jsx `SgEditor`), opened by a tap or Enter on a
 * tile: title, duration or cadence, group, and the agent's suggested group.
 * Remove deletes the tile. The group chips are how keyboard users sort.
 */
export function SgEditor({
  tile,
  onSave,
  onDelete,
  onClose,
}: {
  tile: SgTile;
  onSave: (tile: SgTile) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [t, setT] = useState(tile.t);
  const [min, setMin] = useState(tile.min);
  const [perWeek, setPerWeek] = useState(tile.perWeek ?? 7);
  const [horizon, setHorizon] = useState(tile.horizon);
  const [g, setG] = useState(tile.g ?? tile.s);

  // Escape closes the editor, not the game behind it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  const horizons =
    horizon && !EDITOR_HORIZONS.some((h) => h === horizon)
      ? [horizon, ...EDITOR_HORIZONS]
      : [...EDITOR_HORIZONS];

  return (
    <div
      className="sg-ed-scrim"
      data-sg-editor=""
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sg-ed" role="dialog" aria-label="Edit tile">
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          aria-label="Title"
          maxLength={120}
          autoFocus
        />
        <span className="sg-ed-l">{detailLabel(tile.k)}</span>
        <div className="sg-chips">
          {tile.k === "habit"
            ? EDITOR_PER_WEEK.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="sg-chip"
                  aria-pressed={perWeek === n}
                  onClick={() => setPerWeek(n)}
                >
                  {cadenceLabel(n)}
                </button>
              ))
            : tile.k === "project"
              ? horizons.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="sg-chip"
                    aria-pressed={horizon === h}
                    onClick={() => setHorizon(h)}
                  >
                    {h}
                  </button>
                ))
              : EDITOR_MINUTES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="sg-chip"
                    aria-pressed={min === n}
                    onClick={() => setMin(n)}
                  >
                    {minutesLabel(n)}
                  </button>
                ))}
        </div>
        <span className="sg-ed-l">Group</span>
        <div className="sg-chips">
          {SG_GROUPS.map((x) => (
            <button
              key={x.id}
              type="button"
              className="sg-chip"
              aria-pressed={g === x.id}
              onClick={() => setG(x.id)}
            >
              <i
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 3,
                  background: x.hue,
                }}
              />
              {x.name}
            </button>
          ))}
        </div>
        <div className="sg-ed-sug">
          <SgOrb size={16} />
          <span>
            Needt would put it in{" "}
            <b style={{ color: "var(--sg-ink)" }}>{sgGroup(tile.s).name}</b>.
          </span>
        </div>
        <div className="sg-ed-foot">
          <button
            type="button"
            className="sg-btn is-text"
            data-sg="remove"
            onClick={onDelete}
          >
            Remove
          </button>
          <button
            type="button"
            className="sg-btn is-primary"
            data-sg="save"
            disabled={!t.trim()}
            onClick={() =>
              onSave({
                ...tile,
                t: t.trim(),
                min,
                perWeek: tile.k === "habit" ? perWeek : tile.perWeek,
                horizon,
                g,
              })
            }
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
