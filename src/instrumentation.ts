import * as Sentry from "@sentry/nextjs";

// Next loads the instrumentation hook from src/ when the app lives in
// src/app; a repo-root instrumentation.ts is never picked up. This is the one
// hook: Sentry for each runtime, then the SIGTERM drain.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { installDrainHandlers } = await import("@/lib/drain");
    installDrainHandlers();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
