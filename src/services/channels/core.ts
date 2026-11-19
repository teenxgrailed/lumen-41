import { buildDraft, getDayPlan } from "@/services/day-plan";
import type { PlanItemView, PlanView } from "@/services/day-plan/plan";
import { addDaysToKey, keyFromDate } from "@/services/day-plan/rules";
import { userTimeZone } from "@/services/day-plan/settings";

import { recordActivation } from "@/lib/activation-events";
import { newDate } from "@/lib/date-utils";
import { habitDayKey } from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

import {
  type ActiveLink,
  findActiveLink,
  redeemLinkCode,
  unlinkChat,
} from "./links";
import { type Transcriber, defaultTranscriber } from "./transcribe";
import type {
  AudioPayload,
  IncomingEvent,
  OutgoingMessage,
  PlanAction,
} from "./types";

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

const isDone = (item: PlanItemView) => item.status === "completed";

/** The plan as text, with a done/later action on every task still open. */
function renderPlan(
  header: string,
  plan: PlanView | null,
  footer?: string
): { text: string; actions: PlanAction[] } {
  const items = (plan?.items ?? []).filter(
    (item) => item.resolution === null || item.resolution === "done"
  );
  const lines: string[] = [header];
  const actions: PlanAction[] = [];
  if (items.length === 0) {
    lines.push("", "Nothing is planned.");
  } else {
    lines.push("");
    for (const item of items) {
      if (isDone(item)) {
        lines.push(`✓ ${item.title}`);
      } else {
        lines.push(`- ${item.title}${item.isMain ? " (main)" : ""}`);
        actions.push({
          taskId: item.taskId,
          action: "done",
          title: item.title,
        });
        actions.push({
          taskId: item.taskId,
          action: "later",
          title: item.title,
        });
      }
    }
    const done = items.filter(isDone).length;
    lines.push("", `${done} of ${items.length} done.`);
  }
  if (footer) lines.push("", footer);
  return { text: lines.join("\n"), actions };
}

/**
 * The morning plan or the evening review of a person, as an outgoing message.
 * The caller decides whether to send it (the touch sweep owns the schedule).
 */
export async function buildTouchMessage(
  userId: string,
  kind: "morning" | "evening",
  now: Date = newDate()
): Promise<OutgoingMessage> {
  const today = habitDayKey(now, await userTimeZone(userId));
  const { plan } = await getDayPlan(userId, today, now);
  const rendered =
    kind === "morning"
      ? renderPlan("Plan for today", plan)
      : renderPlan(
          "Evening review",
          plan,
          "What is on for tomorrow? Reply with text or a voice note."
        );
  return { kind, ...rendered };
}

/* ---------- plan actions ---------- */

interface ActionOutcome {
  message: OutgoingMessage;
}

const STALE_TEXT = "That task is no longer in the plan.";

/**
 * The open plan row of a task of this person, or null when there is none: the
 * task is gone, trashed, or only on days that were already closed.
 */
async function openPlanItem(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: {
      id: true,
      status: true,
      trashedAt: true,
      isRecurring: true,
      somedayAt: true,
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
  if (items.length === 0) return null;
  const item = [...items].sort(
    (a, b) => b.plan.date.getTime() - a.plan.date.getTime()
  )[0];
  return { task, item, dateKey: keyFromDate(item.plan.date) };
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
  now: Date
): Promise<ActionOutcome> {
  const found = await openPlanItem(userId, taskId);
  if (!found) return { message: reply(STALE_TEXT) };
  const { task, item, dateKey } = found;

  if (action === "done") {
    if (task.isRecurring) {
      return {
        message: reply("Open Needt to complete a repeating task."),
      };
    }
    if (task.status !== "completed") {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "completed", completedAt: now, lastTouchedAt: now },
      });
    }
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
  return { message: await rerender(userId, dateKey, now) };
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
  if (created.length === 0) {
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
      : created.filter((task) => planned.has(task.id));
  const waiting = created.length - inPlan.length;
  const listed = inPlan.length > 0 ? inPlan : created;
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
        now
      );
      recordActivation("channel_reply", userId, {
        channel: link.channel,
        kind: "button",
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
