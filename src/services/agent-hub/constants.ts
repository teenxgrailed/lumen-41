/**
 * Agent hub vocabulary (openspec add-agent-hub). Status and kind are plain
 * text in the database, so adding a value later needs no migration.
 */

export const HUB_KINDS = [
  "claude",
  "codex",
  "grok",
  "routine",
  "other",
] as const;
export type HubKind = (typeof HUB_KINDS)[number];

export const HUB_RISKS = [
  "money",
  "send_message",
  "publish",
  "delete",
] as const;
export type HubRisk = (typeof HUB_RISKS)[number];

export const ITEM_STATUSES = [
  "open",
  "claimed",
  "in_progress",
  "blocked",
  "needs_owner",
  "done",
  "failed",
  "cancelled",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const TERMINAL_STATUSES: readonly string[] = [
  "done",
  "failed",
  "cancelled",
];
/** Statuses in which an agent holds the item under a lease. */
export const HELD_STATUSES: readonly string[] = [
  "claimed",
  "in_progress",
  "blocked",
];

export const LEASE_DEFAULT_MINUTES = 30;
export const LEASE_MAX_MINUTES = 240;

/** An open "any capable" item nobody can do raises one owner alert after this. */
export const NO_AGENT_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;
/** Finished items leave the default view after this; they are never deleted. */
export const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export const INBOX_DEFAULT_LIMIT = 10;
export const INBOX_MAX_LIMIT = 25;
export const NOTE_SEARCH_MAX_LIMIT = 25;

export const RESULT_DATA_MAX_BYTES = 8 * 1024;
export const AGENT_TOKEN_PREFIX = "needt_agent_";
/** Scope that opens only the hub tools. */
export const HUB_SCOPE = "agents.hub" as const;

export const SUGGESTED_POLL_SECONDS_BUSY = 60;
export const SUGGESTED_POLL_SECONDS_IDLE = 300;

/** Events returned with each inbox row, newest last. */
export const INBOX_EVENTS_PER_ITEM = 5;

/** Messages between agents (hub mail). */
export const MESSAGE_BODY_MAX = 2000;
export const MESSAGE_SUBJECT_MAX = 120;
export const MESSAGE_RECIPIENTS_MAX = 10;
export const MESSAGES_DEFAULT_LIMIT = 20;
export const MESSAGES_MAX_LIMIT = 50;
/** An agent may send this many messages a minute (writes are rate limited). */
export const MESSAGE_SEND_LIMIT_PER_MINUTE = 20;

/** Advisory reservations of shared resources. */
export const RESERVATION_DEFAULT_MINUTES = 30;
export const RESERVATION_MAX_MINUTES = 240;
