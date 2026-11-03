import { z } from "zod";

import {
  CHECKLIST_MAX_ITEMS,
  HUB_KINDS,
  HUB_RISKS,
  INBOX_MAX_LIMIT,
  LEASE_MAX_MINUTES,
  LINK_KINDS,
  MESSAGES_MAX_LIMIT,
  MESSAGE_BODY_MAX,
  MESSAGE_RECIPIENTS_MAX,
  MESSAGE_SUBJECT_MAX,
  NOTE_SEARCH_MAX_LIMIT,
  PLAN_MAX_CHILDREN,
  RESERVATION_MAX_MINUTES,
} from "./constants";
import { HubError } from "./errors";

/**
 * Input shapes shared by the MCP tools and the REST routes. They use only
 * plain zod types (no transforms or refinements) because the MCP schema
 * converter supports a narrow subset; normalising (lowercase tags, trimming)
 * happens in the service.
 */

export const linkSchema = z.union([
  z.object({
    label: z.string().min(1).max(120),
    url: z.string().min(1).max(500),
  }),
  z.object({
    type: z.enum(["task", "project", "page"]),
    id: z.string().min(1).max(100),
  }),
]);
export type HubLinkInput = z.infer<typeof linkSchema>;

const skills = z
  .array(z.string().min(1).max(40))
  .max(20)
  .describe("Lowercase tags such as browser, youtube-upload, code-review.");

export const registerInput = z.object({
  name: z.string().min(1).max(60).optional(),
  kind: z.enum(HUB_KINDS).optional(),
  capabilities: z
    .string()
    .max(1000)
    .optional()
    .describe("Free text for humans: what this agent can and cannot do."),
  skills: skills.optional(),
  agentId: z
    .string()
    .optional()
    .describe("Your own agent id; another agent's id is refused."),
});
export type RegisterInput = z.infer<typeof registerInput>;

/**
 * Done-criteria as one text, or as a checklist: with a list, `complete` must
 * answer each entry (criteriaMet as one true/false per entry, same order).
 */
const doneCriteriaField = z
  .union([
    z.string().min(1).max(2000),
    z.array(z.string().min(1).max(300)).min(1).max(CHECKLIST_MAX_ITEMS),
  ])
  .describe(
    "How the other agent knows it is done: a sentence, or a checklist (list of short checks) answered one by one on completion."
  );

/** Running totals for an item, reported by the agent doing the work. */
export const usageSchema = z
  .object({
    tokens: z.number().int().min(0).max(1_000_000_000_000).optional(),
    costUsd: z.number().min(0).max(1_000_000).optional(),
    minutes: z.number().int().min(0).max(1_000_000).optional(),
  })
  .describe(
    "Optional running totals for this item (tokens, cost in USD, minutes). Each report replaces the last."
  );
export type UsageInput = z.infer<typeof usageSchema>;

export const createItemInput = z.object({
  title: z.string().min(1).max(200),
  goal: z.string().min(1).max(4000).describe("At least 20 characters."),
  doneCriteria: doneCriteriaField,
  context: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      "At least 40 characters. Everything the other agent needs; it cannot ask you."
    ),
  links: z.array(linkSchema).max(20).optional(),
  risks: z
    .array(z.enum(HUB_RISKS))
    .max(4)
    .describe(
      "Required. Any of money, send_message, publish, delete the work involves; [] means none."
    ),
  assignee: z
    .string()
    .min(1)
    .max(100)
    .describe('An agent id or name, or "any" with requiredSkills.'),
  requiredSkills: skills.optional(),
  due: z.string().max(40).optional().describe("ISO 8601 date or date-time."),
  taskId: z.string().max(100).optional(),
  projectId: z.string().max(100).optional(),
  clientRef: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Your own key: repeating a create with it returns the same item."
    ),
});
export type CreateItemInput = z.infer<typeof createItemInput>;

/** Repeat this brief on a schedule (Pro). The item being created is the first occurrence. */
export const recurrenceInput = z
  .object({
    rrule: z
      .string()
      .min(5)
      .max(200)
      .describe(
        "iCalendar RRULE evaluated on the wall clock of timezone, for example FREQ=WEEKLY;BYDAY=MO;BYHOUR=9. FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY; BYHOUR without BYMINUTE means on the hour."
      ),
    timezone: z
      .string()
      .max(64)
      .optional()
      .describe(
        "IANA time zone such as Europe/Kyiv; defaults to the owner's time zone."
      ),
    allowOverlap: z
      .boolean()
      .optional()
      .describe(
        "Default false: no new occurrence while the previous one is still open."
      ),
  })
  .describe(
    "Make this a standing job: the hub opens a fresh copy of this brief on each occurrence. Pro plan."
  );
export type RecurrenceInput = z.infer<typeof recurrenceInput>;

export const createItemWithRecurrenceInput = createItemInput.extend({
  recurrence: recurrenceInput.optional(),
});
export type CreateItemWithRecurrenceInput = z.infer<
  typeof createItemWithRecurrenceInput
>;

export const recurrencesListInput = z.object({
  includeInactive: z
    .boolean()
    .optional()
    .describe("Also list paused and ended recurrences."),
  limit: z.number().int().min(1).max(50).optional(),
});
export type RecurrencesListInput = z.infer<typeof recurrencesListInput>;

export const recurrenceUpdateInput = z.object({
  id: z.string().min(1).max(100),
  action: z
    .enum(["pause", "resume", "delete"])
    .describe(
      "pause stops new occurrences, resume continues from the next one (no catch-up), delete removes the recurrence; items it already opened stay."
    ),
});
export type RecurrenceUpdateInput = z.infer<typeof recurrenceUpdateInput>;

export const inboxInput = z.object({
  view: z
    .enum(["inbox", "created", "ready"])
    .optional()
    .describe(
      "inbox (default): work for you, without items still blocked by an unfinished predecessor. ready: only open items you can claim now, best first. created: items you created, with results, blocks and escalations."
    ),
  itemId: z
    .string()
    .max(100)
    .optional()
    .describe("Read one item with its log."),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(INBOX_MAX_LIMIT).optional(),
});
export type InboxInput = z.infer<typeof inboxInput>;

export const claimInput = z.object({
  id: z.string().min(1).max(100),
  leaseMinutes: z.number().int().min(1).max(LEASE_MAX_MINUTES).optional(),
});
export type ClaimInput = z.infer<typeof claimInput>;

export const updateInput = z.object({
  id: z.string().min(1).max(100),
  message: z.string().max(2000).optional(),
  status: z.enum(["in_progress", "blocked"]).optional(),
  blockedOn: z
    .string()
    .max(500)
    .optional()
    .describe(
      "What it waits on (not the owner), required with status blocked."
    ),
  heartbeat: z.boolean().optional(),
  leaseMinutes: z.number().int().min(1).max(LEASE_MAX_MINUTES).optional(),
  usage: usageSchema.optional(),
  expectedVersion: z.number().int().min(1).optional(),
});
export type UpdateInput = z.infer<typeof updateInput>;

export const resultSchema = z.object({
  summary: z.string().max(2000),
  links: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        url: z.string().min(1).max(500),
      })
    )
    .max(20)
    .optional(),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("JSON, at most 8 KB."),
});

export const completeInput = z.object({
  id: z.string().min(1).max(100),
  outcome: z.enum(["done", "failed"]),
  result: resultSchema,
  criteriaMet: z
    .union([z.boolean(), z.array(z.boolean()).max(CHECKLIST_MAX_ITEMS)])
    .optional()
    .describe(
      "Required with outcome done: were the done-criteria met? For a checklist, one true/false per entry in the same order."
    ),
  criteriaNote: z.string().max(300).optional(),
  usage: usageSchema.optional(),
  expectedVersion: z.number().int().min(1).optional(),
});
export type CompleteInput = z.infer<typeof completeInput>;

export const escalateInput = z.object({
  id: z.string().min(1).max(100),
  question: z.string().min(1).max(2000),
  options: z.array(z.string().min(1).max(200)).max(6).optional(),
  risk: z.enum(HUB_RISKS).optional(),
  expectedVersion: z.number().int().min(1).optional(),
});
export type EscalateInput = z.infer<typeof escalateInput>;

export const cancelInput = z.object({
  id: z.string().min(1).max(100),
  reason: z.string().max(500).optional(),
});
export type CancelInput = z.infer<typeof cancelInput>;

export const editItemInput = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200).optional(),
  goal: z.string().min(1).max(4000).optional(),
  doneCriteria: doneCriteriaField.optional(),
  context: z.string().min(1).max(8000).optional(),
  due: z
    .string()
    .max(40)
    .optional()
    .describe("ISO 8601 date or date-time; an empty string clears it."),
  expectedVersion: z.number().int().min(1).optional(),
});
export type EditItemInput = z.infer<typeof editItemInput>;

export const linkInput = z.object({
  fromId: z.string().min(1).max(100),
  toId: z.string().min(1).max(100),
  kind: z
    .enum(LINK_KINDS)
    .describe(
      "blocks: fromId must be done or cancelled before toId can be claimed. parent: fromId is the parent of toId. relates, duplicates (fromId duplicates toId), supersedes (fromId replaces toId): information only."
    ),
});
export type LinkInput = z.infer<typeof linkInput>;

export const ownerLinkInput = linkInput.omit({ fromId: true });

const planStepInput = createItemInput.omit({ clientRef: true });

export const planCreateInput = createItemInput
  .extend({
    sequential: z
      .boolean()
      .optional()
      .describe(
        "true: each step blocks the next, in the order given. Otherwise the steps are independent."
      ),
    children: z
      .array(planStepInput)
      .min(1)
      .max(PLAN_MAX_CHILDREN)
      .describe(
        "The steps, in order. Each is a full brief that stands alone. Every step also blocks the plan item itself, so it becomes ready when all steps are finished."
      ),
  })
  .describe(
    "The plan item is the wrap-up: its own brief is what is done when every step is done."
  );
export type PlanCreateInput = z.infer<typeof planCreateInput>;

export const nextInput = z.object({
  skipIds: z
    .array(z.string().max(100))
    .max(20)
    .optional()
    .describe("Items to pass over (you looked and cannot do them now)."),
});
export type NextInput = z.infer<typeof nextInput>;

export const noteWriteInput = z.object({
  text: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  itemId: z.string().max(100).optional(),
  taskId: z.string().max(100).optional(),
  projectId: z.string().max(100).optional(),
});
export type NoteWriteInput = z.infer<typeof noteWriteInput>;

export const noteSearchInput = z.object({
  query: z.string().max(200).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  itemId: z.string().max(100).optional(),
  authorAgent: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(NOTE_SEARCH_MAX_LIMIT).optional(),
});
export type NoteSearchInput = z.infer<typeof noteSearchInput>;

export const activityInput = z.object({
  agent: z.string().max(100).optional(),
  kinds: z
    .array(
      z.enum([
        "created",
        "claimed",
        "updated",
        "completed",
        "escalated",
        "answered",
      ])
    )
    .max(6)
    .optional(),
  cursor: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type ActivityInput = z.infer<typeof activityInput>;

export const ownerAnswerInput = z.object({
  answer: z.string().min(1).max(2000),
});

export const ownerApproveInput = z.object({
  risks: z.array(z.enum(HUB_RISKS)).min(1).max(4),
  note: z.string().max(300).optional(),
});

export const ownerReassignInput = z.object({
  assignee: z.string().min(1).max(100),
  requiredSkills: skills.optional(),
});

/** Lowercase, trimmed, de-duplicated tags that match `[a-z0-9][a-z0-9._-]*`. */
export function normalizeTags(values: readonly string[] | undefined, max = 20) {
  const out = new Set<string>();
  for (const raw of values ?? []) {
    const tag = raw.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(tag)) {
      throw new HubError(
        "INVALID",
        `"${raw}" is not a valid tag: use lowercase letters, digits, dot, dash or underscore (max 40).`
      );
    }
    out.add(tag);
  }
  if (out.size > max) throw new HubError("INVALID", `At most ${max} tags.`);
  return [...out];
}

export const messageSendInput = z.object({
  to: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(MESSAGE_RECIPIENTS_MAX)
    .describe(
      'Agent names or ids, "owner", or "any" (then set skills: every agent with all those skills gets it).'
    ),
  skills: skills.optional(),
  body: z.string().min(1).max(MESSAGE_BODY_MAX),
  subject: z
    .string()
    .max(MESSAGE_SUBJECT_MAX)
    .optional()
    .describe("Needed to start a thread; ignored when threadId is set."),
  threadId: z.string().max(100).optional().describe("Reply in this thread."),
  itemId: z.string().max(100).optional(),
  importance: z.enum(["normal", "high"]).optional(),
  ackRequired: z.boolean().optional(),
});
export type MessageSendInput = z.infer<typeof messageSendInput>;

export const messagesReadInput = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(MESSAGES_MAX_LIMIT).optional(),
});
export type MessagesReadInput = z.infer<typeof messagesReadInput>;

export const messageAckInput = z.object({
  messageId: z.string().min(1).max(100),
});

export const threadReadInput = z.object({
  threadId: z.string().min(1).max(100),
});

export const ownerMessageInput = z.object({
  threadId: z.string().max(100).optional(),
  to: z
    .array(z.string().min(1).max(100))
    .max(MESSAGE_RECIPIENTS_MAX)
    .optional(),
  subject: z.string().max(MESSAGE_SUBJECT_MAX).optional(),
  body: z.string().min(1).max(MESSAGE_BODY_MAX),
  importance: z.enum(["normal", "high"]).optional(),
  ackRequired: z.boolean().optional(),
});
export type OwnerMessageInput = z.infer<typeof ownerMessageInput>;

export const reserveInput = z.object({
  resource: z
    .string()
    .min(3)
    .max(200)
    .describe(
      'kind:name, such as "instagram:@needt.app", "account:hello@needt.app" or "file:src/app/**" (globs overlap-checked).'
    ),
  reason: z.string().min(1).max(300),
  exclusive: z.boolean().optional().describe("Default true."),
  ttlMinutes: z
    .number()
    .int()
    .min(1)
    .max(RESERVATION_MAX_MINUTES)
    .optional()
    .describe("Default 30, at most 240. Reserve again to renew."),
});
export type ReserveInput = z.infer<typeof reserveInput>;

export const releaseInput = z.object({
  resource: z.string().min(1).max(200).optional(),
  id: z.string().max(100).optional(),
});
export type ReleaseInput = z.infer<typeof releaseInput>;
/** Done-criteria as a sentence or a checklist, in the form we store. */
export function splitCriteria(value: string | readonly string[]): {
  text: string;
  items: string[];
} {
  if (typeof value === "string") return { text: value.trim(), items: [] };
  const items = value.map((entry) => entry.trim()).filter(Boolean);
  return { text: items.map((entry) => `- ${entry}`).join("\n"), items };
}
