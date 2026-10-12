/* THE WAY TO THE HAND FROM OUTSIDE IT.
 *
 * The mounted <AgentCursor> registers its handle here; the corner (and any
 * later caller) asks for a run through `runAgent`. No window global: the
 * prototype's `window.__agent` was an artefact of classic scripts.
 */
import type {
  AgentCursorHandle,
  AgentRun,
} from "@/components/needt/cursor/types";

let live: AgentCursorHandle | null = null;

export function setAgentHand(hand: AgentCursorHandle | null): void {
  live = hand;
}

/** Play a run; resolves when the hand is home (at once when none is mounted). */
export function runAgent(run: AgentRun): Promise<void> {
  return live ? live.run(run) : Promise.resolve();
}

export function agentBusy(): boolean {
  return live ? live.busy() : false;
}
