import { AgentMemoryKind, AgentMemorySource, Prisma } from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-encryption";

export const AGENT_MEMORY_LIMIT = 100;

export const memoryInputSchema = z.object({
  kind: z.nativeEnum(AgentMemoryKind),
  content: z.string().trim().min(3).max(500),
  source: z.nativeEnum(AgentMemorySource).default(AgentMemorySource.chat),
  weight: z.number().min(0.1).max(10).default(1),
});

export type RankedMemory = {
  id: string;
  kind: AgentMemoryKind | string;
  content: string;
  weight: number;
  lastUsedAt: Date;
};

export function rankMemories(memories: RankedMemory[], now = newDate()) {
  return [...memories].sort((a, b) => {
    const ageA = Math.max(0, now.getTime() - a.lastUsedAt.getTime());
    const ageB = Math.max(0, now.getTime() - b.lastUsedAt.getTime());
    const recencyA = 1 / (1 + ageA / 86_400_000);
    const recencyB = 1 / (1 + ageB / 86_400_000);
    return b.weight + recencyB - (a.weight + recencyA);
  });
}

/** Matches things a memory must never hold; checked on every write path. */
const SENSITIVE =
  /(password|api[- ]?key|secret|token|credit card|bank|diagnos|medication|health)/i;

export function isSensitiveMemory(content: string) {
  return SENSITIVE.test(content);
}

/** A memory as the person, the API and the prompt see it: content in plain text. */
export type MemoryView = {
  id: string;
  kind: AgentMemoryKind;
  content: string;
  source: AgentMemorySource;
  sourceKey: string | null;
  data: Prisma.JsonValue | null;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
};

type MemoryRow = Omit<MemoryView, "content"> & { content: string };

/** Content is stored sealed (enc:v1); a row written before that stays readable. */
function openContent(stored: string): string | null {
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

function toView(row: MemoryRow): MemoryView | null {
  const content = openContent(row.content);
  return content === null ? null : { ...row, content };
}

function toViews(rows: MemoryRow[]): MemoryView[] {
  return rows.flatMap((row) => {
    const view = toView(row);
    return view ? [view] : [];
  });
}

/** "Let Needt learn about me". Off unless the person turned it on. */
export async function isLearningEnabled(userId: string) {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { learnAboutMe: true },
  });
  return row?.learnAboutMe === true;
}

export async function setLearningEnabled(userId: string, enabled: boolean) {
  await prisma.userSettings.upsert({
    where: { userId },
    update: { learnAboutMe: enabled },
    create: {
      userId,
      learnAboutMe: enabled,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}

/** Every memory the person has, decrypted, for Settings, the API and export. Ignores the switch. */
export async function listAgentMemories(userId: string, workspaceId: string) {
  const rows = await prisma.agentMemory.findMany({
    where: { userId, workspaceId },
    orderBy: [{ weight: "desc" }, { lastUsedAt: "desc" }],
    take: AGENT_MEMORY_LIMIT,
  });
  return toViews(rows as MemoryRow[]);
}

/** Every memory in every workspace, decrypted: the data export. Ignores the switch. */
export async function listMemoriesForExport(userId: string) {
  const rows = await prisma.agentMemory.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.flatMap((row) => {
    const view = toView(row as MemoryRow);
    return view
      ? [{ ...view, workspaceId: row.workspaceId, sourceKey: undefined }]
      : [];
  });
}

/**
 * The memories Ask and the scheduler may use. Switch off means none: what was
 * learned stays on the list for the person to read, but nothing reads it.
 */
export async function listMemoriesForUse(userId: string, workspaceId: string) {
  if (!(await isLearningEnabled(userId))) return [];
  return listAgentMemories(userId, workspaceId);
}

async function trimToLimit(userId: string, workspaceId: string) {
  const count = await prisma.agentMemory.count({
    where: { userId, workspaceId },
  });
  if (count <= AGENT_MEMORY_LIMIT) return;
  const stale = await prisma.agentMemory.findMany({
    where: { userId, workspaceId },
    orderBy: [{ lastUsedAt: "asc" }, { weight: "asc" }],
    take: count - AGENT_MEMORY_LIMIT,
    select: { id: true },
  });
  if (!stale.length) return;
  await prisma.agentMemory.deleteMany({
    where: { userId, workspaceId, id: { in: stale.map((item) => item.id) } },
  });
}

export async function rememberForUser(
  userId: string,
  workspaceId: string,
  input: z.input<typeof memoryInputSchema>
) {
  const data = memoryInputSchema.parse(input);
  if (isSensitiveMemory(data.content)) {
    throw new Error("Memories do not hold sensitive information");
  }
  // Sealed text differs on every write, so a repeat is found by reading, not by query.
  const sameKind = await prisma.agentMemory.findMany({
    where: { userId, workspaceId, kind: data.kind, sourceKey: null },
  });
  const existing = sameKind.find(
    (row) =>
      openContent(row.content)?.toLowerCase() === data.content.toLowerCase()
  );
  const memory = existing
    ? await prisma.agentMemory.update({
        where: { id: existing.id },
        data: {
          source: data.source,
          weight: Math.max(existing.weight, data.weight),
          lastUsedAt: newDate(),
        },
      })
    : await prisma.agentMemory.create({
        data: {
          userId,
          workspaceId,
          ...data,
          content: encryptSecret(data.content),
        },
      });
  await trimToLimit(userId, workspaceId);
  return { ...memory, content: data.content };
}

/**
 * A memory Needt computes or extracts, kept under a stable key so a new pass
 * replaces the old line instead of adding another.
 */
export async function upsertKeyedMemory(
  userId: string,
  workspaceId: string,
  input: {
    sourceKey: string;
    kind: AgentMemoryKind;
    content: string;
    source: AgentMemorySource;
    weight?: number;
    data?: Prisma.InputJsonValue;
  }
) {
  const content = memoryInputSchema.shape.content.parse(input.content);
  if (isSensitiveMemory(content)) return null;
  const existing = await prisma.agentMemory.findFirst({
    where: { userId, workspaceId, sourceKey: input.sourceKey },
  });
  const fields = {
    kind: input.kind,
    source: input.source,
    weight: input.weight ?? 1,
    content: encryptSecret(content),
    data: input.data ?? Prisma.JsonNull,
  };
  const row = existing
    ? await prisma.agentMemory.update({
        where: { id: existing.id },
        data: fields,
      })
    : await prisma.agentMemory.create({
        data: { userId, workspaceId, sourceKey: input.sourceKey, ...fields },
      });
  await trimToLimit(userId, workspaceId);
  return { ...row, content };
}

/** The person edits a line. Editing makes it theirs: it stops being replaced by later passes. */
export async function updateMemoryForUser(
  userId: string,
  workspaceId: string,
  memoryId: string,
  patch: { content?: string; kind?: AgentMemoryKind }
) {
  const row = await prisma.agentMemory.findFirst({
    where: { id: memoryId, userId, workspaceId },
  });
  if (!row) return null;
  const data: Prisma.AgentMemoryUpdateInput = {};
  if (patch.content !== undefined) {
    const content = memoryInputSchema.shape.content.parse(patch.content);
    if (isSensitiveMemory(content)) {
      throw new Error("Memories do not hold sensitive information");
    }
    data.content = encryptSecret(content);
    data.sourceKey = null;
    data.data = Prisma.JsonNull;
    data.source = AgentMemorySource.chat;
  }
  if (patch.kind) data.kind = patch.kind;
  const updated = await prisma.agentMemory.update({
    where: { id: row.id },
    data,
  });
  return toView(updated as MemoryRow);
}

const skipKey = (workspaceId: string, sourceKey: string) =>
  `${workspaceId}:${sourceKey}`;

/** Learned lines the person deleted: Needt does not compute them again. */
export async function getLearnedSkips(userId: string): Promise<string[]> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { learnedSkips: true },
  });
  return row?.learnedSkips ?? [];
}

async function addLearnedSkip(userId: string, key: string) {
  const skips = await getLearnedSkips(userId);
  if (skips.includes(key)) return;
  await prisma.userSettings.updateMany({
    where: { userId },
    data: { learnedSkips: [...skips, key] },
  });
}

async function resetLearnedSkips(userId: string, workspaceId?: string) {
  const skips = await getLearnedSkips(userId);
  const kept = workspaceId
    ? skips.filter((key) => !key.startsWith(`${workspaceId}:`))
    : [];
  if (kept.length === skips.length) return;
  await prisma.userSettings.updateMany({
    where: { userId },
    data: { learnedSkips: kept },
  });
}

/**
 * Deleting a line Needt computed (a habit) leaves a tombstone, so the next
 * pass does not bring it back. Forget all is the reset.
 */
export async function forgetForUser(
  userId: string,
  workspaceId: string,
  memoryId: string
) {
  const row = await prisma.agentMemory.findFirst({
    where: { id: memoryId, userId, workspaceId },
    select: { sourceKey: true },
  });
  const result = await prisma.agentMemory.deleteMany({
    where: { id: memoryId, userId, workspaceId },
  });
  if (result.count > 0 && row?.sourceKey) {
    await addLearnedSkip(userId, skipKey(workspaceId, row.sourceKey));
  }
  return result.count > 0;
}

export async function clearAgentMemories(userId: string, workspaceId: string) {
  const result = await prisma.agentMemory.deleteMany({
    where: { userId, workspaceId },
  });
  await resetLearnedSkips(userId, workspaceId);
  return result;
}

/** Every workspace at once: what "delete them" does when the switch is turned off. */
export async function clearAllAgentMemories(userId: string) {
  const result = await prisma.agentMemory.deleteMany({ where: { userId } });
  await resetLearnedSkips(userId);
  return result;
}

export function isLearnedSkip(
  skips: string[],
  workspaceId: string,
  sourceKey: string
) {
  return skips.includes(skipKey(workspaceId, sourceKey));
}

export async function touchMemories(
  userId: string,
  workspaceId: string,
  memoryIds: string[]
) {
  if (!memoryIds.length) return;
  await prisma.agentMemory.updateMany({
    where: { userId, workspaceId, id: { in: memoryIds } },
    data: { lastUsedAt: newDate() },
  });
}

/**
 * The learned ratio of real time to estimate, for the scheduler; null when the
 * switch is off or nothing has been learned. Clamped so one odd week cannot
 * halve or triple every block.
 */
export const DURATION_RATIO_KEY = "habit:duration-ratio";
export const DURATION_RATIO_MIN = 0.5;
export const DURATION_RATIO_MAX = 2;

export async function getLearnedDurationRatio(
  userId: string,
  workspaceId?: string
): Promise<number | null> {
  if (!(await isLearningEnabled(userId))) return null;
  const row = await prisma.agentMemory.findFirst({
    where: {
      userId,
      sourceKey: DURATION_RATIO_KEY,
      ...(workspaceId ? { workspaceId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { data: true },
  });
  const ratio = (row?.data as { ratio?: unknown } | null)?.ratio;
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return null;
  return Math.min(DURATION_RATIO_MAX, Math.max(DURATION_RATIO_MIN, ratio));
}

/** A memory as the API shows it: the plain line, where it came from, and when. */
export function publicMemory(memory: MemoryView) {
  return {
    id: memory.id,
    kind: memory.kind,
    content: memory.content,
    source: memory.source,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

export function memoryJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
