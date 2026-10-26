import type { SyncSource } from "./sync-source";

export type SyncKind = "saved" | "syncing" | "offline" | "error";

export interface SyncInput {
  online: boolean;
  /** Writes the offline queue reports; null until the worker has answered. */
  queued: number | null;
  /** Mutations in flight. */
  mutating: number;
  /** Mutations whose last run failed and that nothing newer has replaced. */
  failedMutations: number;
  source: SyncSource | null;
}

export interface SyncView {
  kind: SyncKind;
  /** The short label beside the dot. */
  label: string;
  /** The popover's heading. */
  title: string;
  /** What is waiting, if anything. */
  waiting: string | null;
  /** One sentence for the popover. */
  detail: string;
  retryable: boolean;
}

export function changesLabel(n: number) {
  return `${n} ${n === 1 ? "change" : "changes"}`;
}

/** One answer from the global queue and the open document's provider. */
export function deriveSyncStatus(input: SyncInput): SyncView {
  const { online, queued, mutating, failedMutations, source } = input;
  const queuedN = queued && queued > 0 ? queued : 0;
  if (!online) {
    const drafted = source?.save === "offline" || source?.save === "failed";
    return {
      kind: "offline",
      label: "Offline — changes kept",
      title: "Offline",
      waiting: queuedN ? `${changesLabel(queuedN)} waiting` : null,
      detail: drafted
        ? "Draft kept on this device. It syncs when you are back online."
        : "You can keep working. Edits sync when you are back online.",
      retryable: false,
    };
  }
  if (source?.save === "failed") {
    return {
      kind: "error",
      label: "Not saved",
      title: "Not saved",
      waiting: "Draft kept on this device",
      detail: "The server has not saved your latest edit.",
      retryable: true,
    };
  }
  if (source?.collab === "local") {
    return {
      kind: "error",
      label: "Draft only",
      title: "Local draft only",
      waiting: "Draft kept on this device",
      detail: "Live sync is disconnected, so the server has not saved this.",
      retryable: true,
    };
  }
  if (failedMutations > 0) {
    return {
      kind: "error",
      label: "Not saved",
      title: "Not saved",
      waiting: `${changesLabel(failedMutations)} not saved`,
      detail: "A change did not reach the server.",
      retryable: true,
    };
  }
  if (
    mutating > 0 ||
    source?.save === "saving" ||
    source?.save === "offline" ||
    source?.collab === "connecting"
  ) {
    return {
      kind: "syncing",
      label: "Saving…",
      title: "Saving",
      waiting: mutating > 0 ? `${changesLabel(mutating)} sending` : null,
      detail:
        source?.collab === "connecting"
          ? "Connecting to live sync."
          : "Sending your changes to the server.",
      retryable: false,
    };
  }
  return {
    kind: "saved",
    label: "Saved",
    title: "Saved",
    waiting: null,
    detail: "Everything is saved to the server.",
    retryable: false,
  };
}
