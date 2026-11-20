import { cleanupChannelRows } from "@/services/channels/links";

/**
 * Daily: forgets handled messenger update ids and expired link codes older
 * than a week. Cheap and idempotent; with no channel in use it deletes nothing.
 */
export async function sweepChannelRows(): Promise<{
  updates: number;
  codes: number;
}> {
  return cleanupChannelRows();
}
