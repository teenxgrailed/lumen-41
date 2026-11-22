import { buildDraft, getDayPlan } from "@/services/day-plan";
import { addDaysToKey, keyFromDate } from "@/services/day-plan/rules";
import { userTimeZone } from "@/services/day-plan/settings";
import { updateTaskFields } from "@/services/tasks/task-update";
import { WorkspaceRole } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import {
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { habitDayKey } from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

import { TaskStatus } from "@/types/task";

import {
  type ActiveLink,
  findActiveLink,
  redeemLinkCode,
  unlinkChat,
} from "./links";
import { renderPlan } from "./render";
import { type Transcriber, defaultTranscriber } from "./transcribe";
import type { AudioPayload, IncomingEvent, OutgoingMessage } from "./types";

export { buildTouchMessage } from "./render";

export type {
  AudioPayload,
  ChannelAdapter,
  ChannelTarget,
  IncomingEvent,
  InboundUpdate,
  OutgoingMessage,
  PlanAction,
  PlanActionKind,
} from "./types";

/**
 * The channel-independent plan brain. It turns an incoming event (text, a voice
 * note, a button press) into plan actions through the day-plan service and
 * builds the messages a person gets (morning plan, evening review). It never
 * imports an adapter: a messenger only translates to and from these types.
 */

/** Messages a linked person can send in a minute before the bot slows down. */
const MESSAGES_PER_MINUTE = 20;
/** A reply longer than this is cut before it is parsed. */
const REPLY_MAX_CHARS = 2_000;
const TITLE_ECHO_MAX = 10;

export interface CoreDeps {
  now?: () => Date;
  transcriber?: Transcriber;
  /** Fetches a voice note's audio; supplied by the adapter that received it. */
  loadVoice?: (voiceFileRef: string) => Promise<AudioPayload | null>;
  /** True when `key` is still under `limit` hits in the window. */
  allow?: (
    key: string,
    limit: number,
    windowSeconds: number
  ) => Promise<boolean>;
}

export interface IncomingContext {
  channel: string;
  externalChatId: string;
  event: IncomingEvent;
}

const reply = (text: string): OutgoingMessage => ({
  kind: "reply",
  text,
  actions: [],
});

const UNLINKED_TEXT =
  "This chat is not linked to a Needt account yet. Open Needt, go to Settings, " +
  "connect this messenger and send me the code you get there.";

const HELP_TEXT =
  "I send your plan in the morning and a short review in the evening. Reply " +
  "with tomorrow's tasks as text or a voice note, one per line or in one " +
  "sentence. Send /stop to unlink this chat.";

/** The default limiter: Redis counters, failing closed when Redis is down. */
async function defaultAllow(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const limited = await enforceRateLimits(
    [accountRule(key, "channel-message", limit, windowSeconds)],
    { route: "channels" }
  );
  return limited === null;
}

/* ---------- rendering ---------- */

/* ---------- plan actions ---------- */

interface ActionOutcome {
  message: OutgoingMessage;
}

const STALE_TEXT = "That task is no longer in the plan.";

/**
 * The open plan row of a task of this person, or null when there is none: the
 * task is gone, trashed, or only on days that were already closed.
 */
async function openPlanItem(userId: string, taskId: string, dateKey: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: {
      id: true,
      status: true,
      trashedAt: true,
      isRecurring: true,
      somedayAt: true,
      workspaceId: true,
    },
  });
  if (!task || task.trashedAt) return null;
  const items = await prisma.dayPlanItem.findMany({
    where: {
      taskId,
      resolution: null,
      plan: { userId, status: { not: "closed" } },
    },
    include: { plan: { select: { date: true, status: true } } },
  });
  // The day of the message that was pressed, never another day's row.
  const item = items.find((row) => keyFromDate(row.plan.date) === dateKey);
  if (!item) return null;
  return { task, item, dateKey };
}

async function rerender(
  userId: string,
  dateKey: string,
  now: Date
): Promise<OutgoingMessage> {
  const { plan } = await getDayPlan(userId, dateKey, now);
  return { kind: "update", ...renderPlan("Plan", plan) };
}

async function handleAction(
  userId: string,
  action: "done" | "later",
  taskId: string,
  now: Date,
  pressedDateKey?: string
): Promise<ActionOutcome> {
  // An older control without a day means today, in the person's time zone.
  const found = await openPlanItem(
    userId,
    taskId,
    pressedDateKey ?? habitDayKey(now, await userTimeZone(userId))
  );
  if (!found) return { message: reply(STALE_TEXT) };
  const { task, item, dateKey } = found;

  if (action === "done") {
    // The same completion the app uses (recurrence, change tracking, webhook,
    // calendar block, focus end, reminders, scheduler), not a bare update.
    let workspace;
    try {
      workspace = await resolveWorkspaceAccess({
        userId,
        requestedWorkspaceId: task.workspaceId ?? undefined,
        requiredRole: WorkspaceRole.EDITOR,
      });
    } catch (error) {
      if (error instanceof WorkspaceAuthorizationError) {
        return { message: reply("You can't edit that task any more.") };
      }
      throw error;
    }
    const result = await updateTaskFields({
      userId,
      workspace,
      taskId,
      patch: { status: TaskStatus.COMPLETED },
    });
    if (!result.ok) return { message: reply(STALE_TEXT) };
    // A repeat tick on a series that was already done today counts as done in
    // the plan too, so the row stops offering the button.
    if (task.isRecurring || result.recurringAlreadyDone) {
      // The series row stays open for its next date; this occurrence is done.
      await prisma.dayPlanItem.update({
        where: { id: item.id },
        data: { resolution: "done" },
      });
    }
    await prisma.task.updateMany({
      where: { id: taskId, userId },
      data: { lastTouchedAt: now },
    });
    await publishRealtimeEventSafe(userId, "tasks-updated");
  } else {
    // "Later" is Someday: out of the plan and off the home screen.
    await prisma.task.updateMany({
      where: { id: taskId, userId, somedayAt: null },
      data: { somedayAt: now, somedayReason: "button", lastTouchedAt: now },
    });
    await prisma.dayPlanItem.deleteMany({ where: { id: item.id } });
    if (task.somedayAt === null) {
      recordActivation("task_to_someday", userId, { reason: "button" });
    }
  }
  const message = await rerender(userId, dateKey, now);
  return {
    message: action === "done" ? { ...message, celebrate: true } : message,
  };
}

/* ---------- stickers ---------- */

const STICKER_HELP_TEXT =
  "I can read a few stickers: ✅ 👍 👌 💪 mark your next task done, 🌙 💤 ⏭ " +
  "move it to later. For anything else, send text or a voice note.";

const NOTHING_OPEN_TEXT = "Nothing is left open in today's plan.";

const STICKER_INTENTS: Record<string, "done" | "later"> = {
  "✅": "done",
  "👍": "done",
  "👌": "done",
  "💪": "done",
  "🌙": "later",
  "💤": "later",
  "⏭": "later",
};

/** The emoji without skin-tone and variation selectors, so a toned 👍 reads as 👍. */
const bareEmoji = (emoji: string) =>
  emoji.replace(/[\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F]/gu, "");

async function handleSticker(
  userId: string,
  emoji: string | undefined,
  now: Date
): Promise<OutgoingMessage> {
  const intent = emoji ? STICKER_INTENTS[bareEmoji(emoji)] : undefined;
  if (!intent) return reply(STICKER_HELP_TEXT);
  const dateKey = habitDayKey(now, await userTimeZone(userId));
  const { plan } = await getDayPlan(userId, dateKey, now);
  // The next open task of today's plan, the one the buttons offer first.
  const next = (plan?.items ?? []).find(
    (item) => item.resolution === null && item.status !== "completed"
  );
  if (!next) return reply(NOTHING_OPEN_TEXT);
  const { message } = await handleAction(
    userId,
    intent,
    next.taskId,
    now,
    dateKey
  );
  return message;
}

/* ---------- replies that become tasks ---------- */

async function replyAsTasks(
  userId: string,
  text: string,
  now: Date
): Promise<{ message: OutgoingMessage; created: number }> {
  const today = habitDayKey(now, await userTimeZone(userId));
  const tomorrow = addDaysToKey(today, 1);
  const result = await buildDraft(userId, tomorrow, {
    note: text.slice(0, REPLY_MAX_CHARS),
    now,
  });
  const created = result.createdTasks;
  const everything = [...created, ...result.matchedTasks];
  if (everything.length === 0) {
    return {
      message: reply(
        "I did not find a task in that. Send one task per line, or one sentence."
      ),
      created: 0,
    };
  }
  const planned = new Set(result.plan.items.map((item) => item.taskId));
  const inPlan =
    result.skipped === "edited"
      ? []
      : everything.filter((task) => planned.has(task.id));
  const waiting = everything.length - inPlan.length;
  const listed = inPlan.length > 0 ? inPlan : everything;
  const shown = listed
    .slice(0, TITLE_ECHO_MAX)
    .map((task) => `- ${task.title}`);
  if (listed.length > TITLE_ECHO_MAX) {
    shown.push(`and ${listed.length - TITLE_ECHO_MAX} more`);
  }
  const lines: string[] = [];
  if (inPlan.length > 0) {
    lines.push("Added to tomorrow:", ...shown);
    if (waiting > 0) {
      lines.push(
        `${waiting} more did not fit your daily limit and wait as suggestions.`
      );
    }
  } else if (result.skipped === "edited") {
    lines.push(
      "Saved. Tomorrow's plan is already arranged, so these wait as suggestions:",
      ...shown
    );
  } else {
    lines.push(
      "Saved. Tomorrow is full, so these wait as suggestions:",
      ...shown
    );
  }
  return { message: reply(lines.join("\n")), created: created.length };
}

/* ---------- entry point ---------- */

async function handleLinked(
  link: ActiveLink,
  event: IncomingEvent,
  deps: CoreDeps,
  now: Date
): Promise<OutgoingMessage | null> {
  const allow = deps.allow ?? defaultAllow;
  const userId = link.userId;

  if (!(await allow(`msg:${userId}`, MESSAGES_PER_MINUTE, 60))) {
    // Slow down once per minute; the rest is dropped without being parsed.
    return (await allow(`slow:${userId}`, 1, 60))
      ? reply("You are sending messages too fast. Give me a minute.")
      : null;
  }

  switch (event.kind) {
    case "help":
      return reply(HELP_TEXT);
    case "link":
      return reply("This chat is already linked.");
    case "unlink":
      return null; // answered before the limiter
    case "action": {
      const { message } = await handleAction(
        userId,
        event.action,
        event.taskId,
        now,
        event.dateKey
      );
      recordActivation("channel_reply", userId, {
        channel: link.channel,
        kind: "button",
        tasksCreated: 0,
      });
      return message;
    }
    case "sticker": {
      const message = await handleSticker(userId, event.emoji, now);
      recordActivation("channel_reply", userId, {
        channel: link.channel,
        kind: "sticker",
        tasksCreated: 0,
      });
      return message;
    }
    case "text":
    case "voice": {
      let text: string;
      if (event.kind === "text") {
        text = event.text;
      } else {
        const transcriber = deps.transcriber ?? defaultTranscriber;
        const result = await transcriber.transcribe({
          load: async () => deps.loadVoice?.(event.voiceFileRef) ?? null,
        });
        if ("unavailable" in result || !result.text.trim()) {
          recordActivation("channel_reply", userId, {
            channel: link.channel,
            kind: "voice",
            tasksCreated: 0,
          });
          return reply(
            "I could not turn that voice note into text. Please send it as text."
          );
        }
        text = result.text;
      }
      if (!text.trim()) return reply(HELP_TEXT);
      const { message, created } = await replyAsTasks(userId, text, now);
      recordActivation("channel_reply", userId, {
        channel: link.channel,
        kind: event.kind,
        tasksCreated: created,
      });
      return message;
    }
  }
}

/**
 * Handles one incoming event from any channel and returns what to answer, or
 * null for nothing. Messages from a chat that is not linked get linking
 * instructions and never touch a plan.
 */
export async function handleIncoming(
  context: IncomingContext,
  deps: CoreDeps = {}
): Promise<OutgoingMessage | null> {
  const now = deps.now?.() ?? newDate();
  const { channel, externalChatId, event } = context;

  if (event.kind === "link") {
    const allow = deps.allow ?? defaultAllow;
    // Guessing codes: a few tries a minute per chat, one notice, then silence.
    if (!(await allow(`link:${channel}:${externalChatId}`, 5, 60))) {
      return (await allow(`linkslow:${channel}:${externalChatId}`, 1, 60))
        ? reply("Too many link attempts. Wait a minute and try again.")
        : null;
    }
    const result = await redeemLinkCode(
      channel,
      event.code,
      externalChatId,
      now
    );
    switch (result.status) {
      case "linked":
        return reply(
          "Linked. You will get your plan here in the morning and a review in the evening. Send /stop to unlink."
        );
      case "already":
        return reply("This chat is already linked.");
      case "taken":
        return reply(
          "This chat is linked to another Needt account. Send /stop there first."
        );
      default:
        return reply(
          "That code did not work. Codes last 10 minutes and work once. Make a new one in Needt."
        );
    }
  }

  const link = await findActiveLink(channel, externalChatId);
  if (!link) {
    const allow = deps.allow ?? defaultAllow;
    // A stranger gets the instructions, but not on every message.
    return (await allow(`unlinked:${channel}:${externalChatId}`, 3, 60))
      ? reply(UNLINKED_TEXT)
      : null;
  }

  if (event.kind === "unlink") {
    await unlinkChat(channel, externalChatId, now);
    return reply("Unlinked. You will not get messages here any more.");
  }
  return handleLinked(link, event, deps, now);
}
