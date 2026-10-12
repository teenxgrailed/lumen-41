"use client";

import { AgentCursor } from "../cursor/AgentCursor";
import { AskCorner } from "./AskCorner";

/** What V3Shell mounts: the corner (pill / island / panel) and the agent's hand. */
export function CornerLayer() {
  return (
    <>
      <AskCorner />
      <AgentCursor />
    </>
  );
}
