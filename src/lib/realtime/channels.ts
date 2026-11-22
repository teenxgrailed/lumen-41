export type RealtimeEventType =
  | "calendar-updated"
  | "tasks-updated"
  | "docs-updated"
  | "schedule-run-updated"
  | "focus-ended"
  | "easy-start";

export interface RealtimeEvent {
  type: RealtimeEventType;
  occurredAt: string;
  feedId?: string;
  runId?: string;
  status?: string;
  sessionId?: string;
  /** The line the open app shows (task title and length). */
  message?: string;
  /** focus-ended "early": minutes given back to the day. */
  minutes?: number;
  /** focus-ended: the task whose Done ended the focus (Undo opens it again). */
  taskId?: string;
  taskTitle?: string;
  /** easy-start: the action Undo runs (POST /api/agent/actions/:id/undo). */
  actionId?: string | null;
  /** easy-start in "suggest" mode: the proposal Apply runs. */
  proposalId?: string | null;
}

export function getUserRealtimeChannel(userId: string): string {
  return `needt:realtime:user:${userId}`;
}
