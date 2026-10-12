import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications";

import type { Settings } from "@/types/settings";

const LOG_SOURCE = "SystemSettings";

type SystemSettingsPatch = Partial<Settings["system"]>;

/**
 * PATCHes admin system settings and hands the saved settings to `apply`.
 * Resolves false when the save failed (401, 500, network): nothing reaches
 * `apply` then, so an error body never lands in the store, and the caller
 * keeps what was typed for a retry.
 */
export async function saveSystemSettings(
  updates: SystemSettingsPatch,
  apply: (settings: SystemSettingsPatch) => void
): Promise<boolean> {
  try {
    const response = await fetch("/api/system-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      logger.error(
        "Failed to update system settings",
        { status: response.status },
        LOG_SOURCE
      );
      notify.error(
        response.status === 401 || response.status === 403
          ? "Not saved: your session has ended. Sign in again and retry."
          : "Not saved. Try again."
      );
      return false;
    }
    apply((await response.json()) as SystemSettingsPatch);
    return true;
  } catch (error) {
    logger.error(
      "Failed to update system settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    notify.error("Not saved. Check your connection and try again.");
    return false;
  }
}
