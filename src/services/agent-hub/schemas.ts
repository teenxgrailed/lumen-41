import { z } from "zod";

import {
  HUB_KINDS,
  HUB_RISKS,
  INBOX_MAX_LIMIT,
  LEASE_MAX_MINUTES,
  NOTE_SEARCH_MAX_LIMIT,
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

export const createItemInput = z.object({
  title: z.string().min(1).max(200),
  goal: z.string().min(1).max(4000).describe("At least 20 characters."),
  doneCriteria: z.string().min(1).max(2000),
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

export const inboxInput = z.object({
  view: z
    .enum(["inbox", "created"])
    .optional()
    .describe(
      "inbox (default): work for you. created: items you created, with results, blocks and escalations."
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
  data: z.record(z.unknown()).optional().describe("JSON, at most 8 KB."),
});

export const completeInput = z.object({
  id: z.string().min(1).max(100),
  outcome: z.enum(["done", "failed"]),
  result: resultSchema,
  criteriaMet: z
    .boolean()
    .optional()
    .describe("Required with outcome done: were the done-criteria met?"),
  criteriaNote: z.string().max(300).optional(),
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
