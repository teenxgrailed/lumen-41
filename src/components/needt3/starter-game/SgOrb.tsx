"use client";

import { AiOrb } from "../orb/AiOrb";

/** The agent's mark in the game (sg-game.jsx `.sg-orb`): the product's AiOrb. */
export function SgOrb({
  size = 26,
  active,
}: {
  size?: number;
  active?: boolean;
}) {
  return (
    <span className="sg-orb">
      <AiOrb size={size} tile={false} active={active} />
    </span>
  );
}
