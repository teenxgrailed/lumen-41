import { BlockingMode } from "@prisma/client";

/** What a profile needs to decide whether it is active. */
export interface BlockingProfileRule {
  id: string;
  name: string;
  sites: string[];
  apps: string[];
  mode: BlockingMode;
  onFocusSession: boolean;
  eventKeywords: string[];
  calendarFeedIds: string[];
  projectIds: string[];
  enabled: boolean;
}

export interface RunningFocusSession {
  id: string;
  startedAt: Date;
  /** When the planned length runs out; null for an open-ended session. */
  endsAt: Date | null;
  taskTitle: string | null;
}

export interface CurrentEvent {
  id: string;
  title: string;
  feedId: string;
  end: Date;
}

export interface CurrentTaskBlock {
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  end: Date;
}

export type BlockingReason =
  | {
      kind: "focus_session";
      id: string;
      title: string | null;
      until: Date | null;
    }
  | { kind: "event"; id: string; title: string; until: Date }
  | { kind: "task_block"; id: string; title: string; until: Date };

export interface ActiveProfile {
  id: string;
  name: string;
  reason: BlockingReason;
}

export interface ActiveBlocking {
  active: boolean;
  /**
   * BLOCKLIST: block `sites` and `apps`. ALLOWLIST: block everything except
   * them. When block-list and allow-list profiles hold at once, the allow
   * list wins: it is the stricter of the two.
   */
  mode: BlockingMode | null;
  sites: string[];
  apps: string[];
  /**
   * When the earliest reason with an end runs out, so the list may change;
   * null when no reason has an end (an open-ended focus session).
   */
  until: Date | null;
  profiles: ActiveProfile[];
}

const INACTIVE: ActiveBlocking = {
  active: false,
  mode: null,
  sites: [],
  apps: [],
  until: null,
  profiles: [],
};

function reasonFor(
  profile: BlockingProfileRule,
  session: RunningFocusSession | null,
  events: CurrentEvent[],
  blocks: CurrentTaskBlock[]
): BlockingReason | null {
  if (profile.onFocusSession && session) {
    return {
      kind: "focus_session",
      id: session.id,
      title: session.taskTitle,
      until: session.endsAt,
    };
  }
  const keywords = profile.eventKeywords.map((k) => k.toLowerCase());
  const event = events.find(
    (e) =>
      profile.calendarFeedIds.includes(e.feedId) ||
      keywords.some((k) => e.title.toLowerCase().includes(k))
  );
  if (event) {
    return {
      kind: "event",
      id: event.id,
      title: event.title,
      until: event.end,
    };
  }
  const block = blocks.find(
    (b) => b.projectId !== null && profile.projectIds.includes(b.projectId)
  );
  if (block) {
    return {
      kind: "task_block",
      id: block.taskId,
      title: block.taskTitle,
      until: block.end,
    };
  }
  return null;
}

/**
 * Which profiles hold right now and the one list the blockers apply. Pure:
 * the caller loads the running session, the events and the task blocks that
 * are under way.
 */
export function resolveActiveBlocking(input: {
  profiles: BlockingProfileRule[];
  session: RunningFocusSession | null;
  events: CurrentEvent[];
  blocks: CurrentTaskBlock[];
}): ActiveBlocking {
  const matched: { profile: BlockingProfileRule; reason: BlockingReason }[] =
    [];
  for (const profile of input.profiles) {
    if (!profile.enabled) continue;
    const reason = reasonFor(
      profile,
      input.session,
      input.events,
      input.blocks
    );
    if (reason) matched.push({ profile, reason });
  }
  if (matched.length === 0) return INACTIVE;

  const allow = matched.filter(
    (m) => m.profile.mode === BlockingMode.ALLOWLIST
  );
  const used = allow.length > 0 ? allow : matched;
  const sites = [...new Set(used.flatMap((m) => m.profile.sites))].sort();
  const apps = [...new Set(used.flatMap((m) => m.profile.apps))].sort();

  let until: Date | null = null;
  for (const { reason } of matched) {
    if (reason.until && (!until || reason.until < until)) until = reason.until;
  }

  return {
    active: true,
    mode: allow.length > 0 ? BlockingMode.ALLOWLIST : BlockingMode.BLOCKLIST,
    sites,
    apps,
    until,
    profiles: matched.map(({ profile, reason }) => ({
      id: profile.id,
      name: profile.name,
      reason,
    })),
  };
}
