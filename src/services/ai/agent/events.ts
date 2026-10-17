import type { AgentActionRef, AgentSource } from "./tools";

/**
 * What /api/ai/chat writes, one JSON object per line. `meta` and `token` are
 * the original pair; `tool` shows progress while a tool runs, and `done`
 * closes the turn with the actions it took (each undoable) and the objects it
 * read.
 */
export interface StreamMeta {
  type: "meta";
  conversationId?: string;
  requiresConfirm?: boolean;
  toolName?: string | null;
  toolPayload?: unknown;
  notice?: string;
}
export interface StreamToken {
  type: "token";
  value?: string;
}
export interface StreamTool {
  type: "tool";
  id: string;
  name: string;
  /** Present continuous while running, past tense when done. */
  label: string;
  status: "running" | "done" | "error";
  href?: string;
}
export interface StreamDone {
  type: "done";
  runId: string | null;
  actions: AgentActionRef[];
  sources: AgentSource[];
  /** The turn ended on a question: a destructive call waits for a yes. */
  requiresConfirm: boolean;
  /** Planner data may have changed; refetch. */
  changed: boolean;
  /** The last task a tool touched. */
  taskId: string | null;
}

export type AgentStreamEvent =
  | StreamMeta
  | StreamToken
  | StreamTool
  | StreamDone;
