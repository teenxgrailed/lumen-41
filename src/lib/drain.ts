import { logger } from "@/lib/logger";

const LOG_SOURCE = "Drain";

/** Docker stops a container after 10 s by default; stay under that. */
export const DEFAULT_DRAIN_MS = 8_000;
export const MAX_DRAIN_MS = 9_000;

type DrainState = {
  draining: boolean;
  installed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

// The instrumentation hook and the route handlers are bundled separately, so
// the flag lives on globalThis to be shared between them.
const STATE_KEY = Symbol.for("needt.drain.state");

function getState(): DrainState {
  const g = globalThis as unknown as Record<symbol, DrainState | undefined>;
  let state = g[STATE_KEY];
  if (!state) {
    state = { draining: false, installed: false, timer: null };
    g[STATE_KEY] = state;
  }
  return state;
}

export function isDraining(): boolean {
  return getState().draining;
}

export function getDrainMs(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.NEEDT_DRAIN_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_DRAIN_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_DRAIN_MS;
  return Math.min(Math.floor(parsed), MAX_DRAIN_MS);
}

/**
 * First signal: start draining (health goes 503, everything else keeps being
 * served) and exit after NEEDT_DRAIN_MS. Second signal: exit immediately.
 */
export function handleShutdownSignal(signal: NodeJS.Signals): void {
  const state = getState();

  if (state.draining) {
    logger.warn("Second shutdown signal, exiting now", { signal }, LOG_SOURCE);
    if (state.timer) clearTimeout(state.timer);
    process.exit(0);
    return;
  }

  state.draining = true;
  const drainMs = getDrainMs();
  logger.info(
    "Shutdown signal received, draining",
    { signal, drainMs },
    LOG_SOURCE
  );
  state.timer = setTimeout(() => {
    logger.info("Drain finished, exiting", { drainMs }, LOG_SOURCE);
    process.exit(0);
  }, drainMs);
}

/** Register SIGTERM and SIGINT handlers once per process. */
export function installDrainHandlers(): void {
  const state = getState();
  if (state.installed) return;
  state.installed = true;
  process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
  process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
}

/** Test helper: reset module state. */
export function resetDrainStateForTests(): void {
  const state = getState();
  if (state.timer) clearTimeout(state.timer);
  state.draining = false;
  state.installed = false;
  state.timer = null;
}
