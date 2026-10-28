"use client";

import { FiChevronDown, FiChevronUp } from "react-icons/fi";

import {
  HOME_BLOCK_LABEL,
  type HomeBlockId,
  type HomeBlocks,
  type RailTile,
  moveRailTile,
} from "@/lib/needt3/home-blocks";

import { V3Switch } from "../settings/kit";

const HINT: Partial<Record<HomeBlockId, string>> = {
  nextUp: "The focus card at the top of the day.",
  weather: "Next to the date in the header.",
};

/**
 * "Show on Home": one switch per block, and up/down buttons that reorder the
 * right rail's tiles. Pure of storage: the caller saves the patch.
 */
export function HomeBlocksForm({
  blocks,
  onChange,
}: {
  blocks: HomeBlocks;
  onChange: (patch: Partial<HomeBlocks>) => void;
}) {
  const row = (id: HomeBlockId, tile?: RailTile) => {
    const i = tile ? blocks.order.indexOf(tile) : -1;
    return (
      <div className="nt-row" key={id} data-hb-row={id}>
        <span className="nt-row-label">{HOME_BLOCK_LABEL[id]}</span>
        <div className="nt-row-control hb-control">
          {tile ? (
            <>
              <button
                type="button"
                className="nx-btn nx-btn-text hb-move"
                aria-label={`Move ${HOME_BLOCK_LABEL[id]} up`}
                data-hb-up={id}
                disabled={i <= 0}
                onClick={() =>
                  onChange({ order: moveRailTile(blocks.order, tile, -1) })
                }
              >
                <FiChevronUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-text hb-move"
                aria-label={`Move ${HOME_BLOCK_LABEL[id]} down`}
                data-hb-down={id}
                disabled={i >= blocks.order.length - 1}
                onClick={() =>
                  onChange({ order: moveRailTile(blocks.order, tile, 1) })
                }
              >
                <FiChevronDown size={14} aria-hidden="true" />
              </button>
            </>
          ) : null}
          <V3Switch
            checked={blocks[id]}
            onChange={(v) => onChange({ [id]: v })}
            label={`Show ${HOME_BLOCK_LABEL[id]} on Home`}
          />
        </div>
        {HINT[id] ? <span className="nt-row-hint">{HINT[id]}</span> : null}
      </div>
    );
  };
  return (
    <div className="nt-form tv-form hb-form" data-home-blocks-form="">
      <span className="hb-title">Show on Home</span>
      {row("nextUp")}
      {row("weather")}
      {blocks.order.map((t) => row(t, t))}
    </div>
  );
}
