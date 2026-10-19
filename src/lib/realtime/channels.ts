export type RealtimeEventType =
  | "calendar-updated"
  | "tasks-updated"
  | "schedule-run-updated"
  | "focus-ended";

export interface RealtimeEvent {
  type: RealtimeEventType;
  occurredAt: string;
  feedId?: string;
  runId?: string;
  status?: string;
  sessionId?: string;
  /** The line the open app shows (task title and length). */
  message?: string;
}

export function getUserRealtimeChannel(userId: string): string {
  return `needt:realtime:user:${userId}`;
}
