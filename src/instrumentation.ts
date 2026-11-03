// Next only loads the instrumentation hook from src/ when the app lives in
// src/app. The repo-root instrumentation.ts (Sentry) is not picked up.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installDrainHandlers } = await import("@/lib/drain");
    installDrainHandlers();
  }
}
