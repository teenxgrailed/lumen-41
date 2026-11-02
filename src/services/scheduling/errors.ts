export const AUTO_SCHEDULE_SETTINGS_MISSING = "AUTO_SCHEDULE_SETTINGS_MISSING";

/**
 * A person with no auto-schedule settings row (never opened the planner, or
 * the row is gone) has nothing to schedule. Callers that run unattended treat
 * it as a no-op instead of failing and burning retries.
 */
export class AutoScheduleSettingsMissingError extends Error {
  readonly code = AUTO_SCHEDULE_SETTINGS_MISSING;

  constructor() {
    super("Auto-schedule settings not found for user");
    this.name = "AutoScheduleSettingsMissingError";
  }
}

export function isAutoScheduleSettingsMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === AUTO_SCHEDULE_SETTINGS_MISSING
  );
}
