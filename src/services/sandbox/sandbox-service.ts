import { shiftDay, taskData } from "@/services/onboarding/sample-service";
import { pageBlocksFromText } from "@/services/pages/page-text-blocks";
import { partsCreateData } from "@/services/tasks/subtasks";
import {
  PageAuthor,
  Prisma,
  SandboxKind,
  SubscriptionPlan,
  SubscriptionStatus,
  WorkspaceKind,
  WorkspaceRole,
} from "@prisma/client";
import { compare, hash } from "bcryptjs";

import { APP_NAME } from "@/lib/app-config";
import {
  addCalendarDays,
  formatInTimeZone,
  fromZonedTime,
  newDate,
} from "@/lib/date-utils";
import { isFeatureEnabledForEveryone } from "@/lib/feature-flags";
import { SANDBOX_ACCOUNTS } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  SANDBOX_DOCS,
  SANDBOX_EVENTS,
  SANDBOX_GOAL,
  SANDBOX_HABITS,
  SANDBOX_MEMORIES,
  SANDBOX_PROJECTS,
  SANDBOX_TASKS,
} from "./sandbox-content";

const LOG_SOURCE = "SandboxAccounts";

/**
 * Sandbox accounts (docs/sandbox-accounts.md): accounts the app provisions
 * itself, so a directory reviewer (Anthropic, OpenAI, Smithery) can sign in
 * without anybody signing up by hand. The same mechanism will carry a public
 * demo account later; only the reviewer kind is provisioned now.
 *
 * Three rules hold everything below together:
 *  - Only a row that already has `sandboxKind` is ever reset. Provisioning
 *    never turns an existing real account into a sandbox, so an email typed
 *    by mistake cannot get somebody's data wiped at night.
 *  - Provisioning is idempotent: run it at every worker start, from the
 *    admin button, before every reset. A second run changes nothing unless the
 *    password in the env changed.
 *  - Everything is behind the `sandbox_accounts` flag. The lockdown is not:
 *    a sandbox row stays locked whatever the flag says.
 */

export interface SandboxAccountConfig {
  kind: SandboxKind;
  email: string;
  password: string;
  name: string;
}

/** Shorter env passwords are refused: the account is on the open internet. */
export const SANDBOX_MIN_PASSWORD_LENGTH = 12;

/** Grants and connector tokens younger than this survive a reset. */
export const SANDBOX_TOKEN_GRACE_MS = 24 * 60 * 60 * 1000;

const PASSWORD_ROUNDS = 12;

type Env = Record<string, string | undefined>;

/**
 * The sandbox accounts this deployment should have. Unset (or half-set)
 * variables mean none, and nothing happens.
 */
export function sandboxConfigsFromEnv(
  env: Env = process.env
): SandboxAccountConfig[] {
  const email = env.SANDBOX_REVIEWER_EMAIL?.trim().toLowerCase();
  const password = env.SANDBOX_REVIEWER_PASSWORD;
  if (!email || !password) return [];
  if (password.length < SANDBOX_MIN_PASSWORD_LENGTH || !email.includes("@")) {
    void logger.warn(
      "Sandbox reviewer env ignored: needs an email and a password of at least 12 characters",
      {},
      LOG_SOURCE
    );
    return [];
  }
  //todo: publicDemo (SANDBOX_DEMO_EMAIL / SANDBOX_DEMO_PASSWORD) once the
  // public demo ships; the lockdown and reset already cover the kind.
  return [
    {
      kind: SandboxKind.reviewer,
      email,
      password,
      name: "Needt Reviewer",
    },
  ];
}

export async function sandboxAccountsEnabled(): Promise<boolean> {
  try {
    return await isFeatureEnabledForEveryone(SANDBOX_ACCOUNTS);
  } catch {
    return false;
  }
}

export type ProvisionStatus = "created" | "updated" | "unchanged" | "refused";

export interface ProvisionOutcome {
  kind: SandboxKind;
  status: ProvisionStatus;
  userId: string | null;
  reason?: string;
}

type Tx = Prisma.TransactionClient;

async function ensureWorkspace(tx: Tx, userId: string): Promise<string> {
  const existing = await tx.workspace.findUnique({
    where: { personalOwnerId: userId },
    select: { id: true },
  });
  const workspace =
    existing ??
    (await tx.workspace.create({
      data: {
        name: "Personal Workspace",
        kind: WorkspaceKind.PERSONAL,
        personalOwnerId: userId,
      },
      select: { id: true },
    }));
  await tx.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    update: { role: WorkspaceRole.OWNER },
    create: { workspaceId: workspace.id, userId, role: WorkspaceRole.OWNER },
  });
  return workspace.id;
}

/**
 * Pro through the same `Subscription` row every limit reads. ACTIVE with no
 * Creem or Stripe id is a comp (`isManualSubscription`) that never expires and
 * that no payment webhook can touch.
 */
async function ensurePro(tx: Tx, userId: string) {
  await tx.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
    },
    update: {
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  });
}

/**
 * Creates the account, or brings an existing sandbox row back in line with
 * the env. Never adopts an account that is not already a sandbox.
 */
export async function provisionSandboxAccount(
  config: SandboxAccountConfig,
  now: Date = newDate()
): Promise<ProvisionOutcome> {
  const existing = await prisma.user.findUnique({
    where: { email: config.email },
    select: {
      id: true,
      sandboxKind: true,
      role: true,
      isActive: true,
      emailVerified: true,
      accounts: {
        where: { provider: "credentials" },
        select: { id: true, id_token: true },
      },
    },
  });

  if (existing && existing.sandboxKind !== config.kind) {
    await logger.error(
      "Sandbox provisioning refused: the address belongs to another account",
      { userId: existing.id, kind: config.kind },
      LOG_SOURCE
    );
    return {
      kind: config.kind,
      status: "refused",
      userId: null,
      reason: existing.sandboxKind
        ? "That address is already a sandbox of another kind."
        : "That address belongs to a real account; it is never turned into a sandbox.",
    };
  }

  if (!existing) {
    const passwordHash = await hash(config.password, PASSWORD_ROUNDS);
    try {
      const userId = await prisma.$transaction(
        async (tx) => {
          const user = await tx.user.create({
            data: {
              email: config.email,
              name: config.name,
              emailVerified: now,
              sandboxKind: config.kind,
              role: "user",
              // The first-run examples and onboarding are not for a reviewer:
              // the reset seeds a fuller day instead.
              sampleSeededAt: now,
              onboardingUses: ["work"],
              onboardingCompletedAt: now,
              accounts: {
                create: {
                  type: "credentials",
                  provider: "credentials",
                  providerAccountId: config.email,
                  id_token: passwordHash,
                },
              },
              userSettings: { create: { theme: "dark", timeZone: "UTC" } },
              autoScheduleSettings: {
                create: {
                  workDays: "[1,2,3,4,5]",
                  workHourStart: 9,
                  workHourEnd: 17,
                  bufferMinutes: 15,
                },
              },
            },
            select: { id: true },
          });
          await ensurePro(tx, user.id);
          const workspaceId = await ensureWorkspace(tx, user.id);
          await seedSandboxContent(tx, { userId: user.id, workspaceId, now });
          return user.id;
        },
        { timeout: 60_000, maxWait: 10_000 }
      );
      await logger.info(
        "Sandbox account created",
        { userId, kind: config.kind },
        LOG_SOURCE
      );
      return { kind: config.kind, status: "created", userId };
    } catch (error) {
      // A concurrent start (worker and admin button) made it first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return provisionSandboxAccount(config, now);
      }
      throw error;
    }
  }

  const credentials = existing.accounts[0];
  const passwordCurrent = Boolean(
    credentials?.id_token &&
      (await compare(config.password, credentials.id_token))
  );
  const repair =
    !passwordCurrent ||
    existing.role !== "user" ||
    !existing.isActive ||
    !existing.emailVerified;

  await prisma.$transaction(async (tx) => {
    if (!passwordCurrent) {
      const passwordHash = await hash(config.password, PASSWORD_ROUNDS);
      if (credentials) {
        await tx.account.update({
          where: { id: credentials.id },
          data: { id_token: passwordHash },
        });
      } else {
        await tx.account.create({
          data: {
            userId: existing.id,
            type: "credentials",
            provider: "credentials",
            providerAccountId: config.email,
            id_token: passwordHash,
          },
        });
      }
    }
    if (repair) {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          role: "user",
          isActive: true,
          emailVerified: existing.emailVerified ?? now,
          // A changed password signs every old session out.
          ...(passwordCurrent ? {} : { sessionVersion: { increment: 1 } }),
        },
      });
    }
    await ensurePro(tx, existing.id);
    await ensureWorkspace(tx, existing.id);
  });

  return {
    kind: config.kind,
    status: repair ? "updated" : "unchanged",
    userId: existing.id,
  };
}

/** Every configured sandbox account, when the flag is on. Never throws. */
export async function provisionSandboxAccounts(
  env: Env = process.env
): Promise<ProvisionOutcome[]> {
  const configs = sandboxConfigsFromEnv(env);
  if (configs.length === 0) return [];
  if (!(await sandboxAccountsEnabled())) return [];
  const outcomes: ProvisionOutcome[] = [];
  for (const config of configs) {
    try {
      outcomes.push(await provisionSandboxAccount(config));
    } catch (error) {
      await logger.error(
        "Sandbox provisioning failed",
        {
          kind: config.kind,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      outcomes.push({
        kind: config.kind,
        status: "refused",
        userId: null,
        reason: "Provisioning failed; see the logs.",
      });
    }
  }
  return outcomes;
}

function validZone(zone: string | null | undefined): string {
  if (!zone) return "UTC";
  try {
    formatInTimeZone(newDate(), zone, "yyyy-MM-dd");
    return zone;
  } catch {
    return "UTC";
  }
}

export interface SandboxSeedCounts {
  projects: number;
  tasks: number;
  events: number;
  pages: number;
  habits: number;
  goals: number;
  memories: number;
}

/**
 * The reviewer's planner, inside the caller's transaction. Rows are written
 * with the same helpers the first-run examples use (`taskData`,
 * `partsCreateData`, `pageBlocksFromText`) but are not flagged `isSample`:
 * they are the account's whole content, not examples to clear.
 */
export async function seedSandboxContent(
  tx: Tx,
  input: { userId: string; workspaceId: string; now: Date }
): Promise<SandboxSeedCounts> {
  const { userId, workspaceId, now } = input;
  const owner = { userId, workspaceId };
  const settings = await tx.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const zone = validZone(settings?.timeZone);
  const today = formatInTimeZone(now, zone, "yyyy-MM-dd");
  const at = (day: number, time: string) =>
    fromZonedTime(`${shiftDay(today, day)}T${time}:00`, zone);

  const goal = await tx.goal.create({
    data: {
      ...owner,
      title: SANDBOX_GOAL.title,
      description: SANDBOX_GOAL.description,
      deadline: newDate(
        `${shiftDay(today, SANDBOX_GOAL.deadlineDays)}T00:00:00.000Z`
      ),
      targetValue: SANDBOX_GOAL.targetValue,
      currentValue: SANDBOX_GOAL.currentValue,
      unit: SANDBOX_GOAL.unit,
    },
    select: { id: true },
  });
  await tx.goalCheckIn.create({
    data: {
      goalId: goal.id,
      userId,
      value: SANDBOX_GOAL.currentValue,
      note: SANDBOX_GOAL.checkInNote,
      createdAt: addCalendarDays(now, -2),
    },
  });

  const projectIds = new Map<string, string>();
  for (const project of SANDBOX_PROJECTS) {
    const row = await tx.project.create({
      data: {
        ...owner,
        name: project.name,
        description: project.description,
        status: "active",
      },
      select: { id: true },
    });
    projectIds.set(project.key, row.id);
  }

  for (const task of SANDBOX_TASKS) {
    const base = taskData(task, today, zone);
    await tx.task.create({
      data: {
        ...base,
        ...owner,
        isSample: false,
        projectId: projectIds.get(task.project) ?? null,
        goalId: task.goal ? goal.id : null,
        ...(task.done
          ? { status: "completed", completedAt: addCalendarDays(now, -1) }
          : {}),
        parts: partsCreateData(
          (task.subtasks ?? []).map((title) => ({ title, done: false }))
        ),
      },
    });
  }

  const feed = await tx.calendarFeed.create({
    data: {
      userId,
      name: APP_NAME,
      type: "LOCAL",
      color: "#6366F1",
      enabled: true,
    },
    select: { id: true },
  });
  for (const event of SANDBOX_EVENTS) {
    const start = at(event.day, event.at);
    await tx.calendarEvent.create({
      data: {
        feedId: feed.id,
        title: event.title,
        start,
        end: new Date(start.getTime() + event.minutes * 60_000),
        location: event.location ?? null,
      },
    });
  }

  for (const [index, doc] of SANDBOX_DOCS.entries()) {
    const blocks = pageBlocksFromText(
      doc.markdown,
      "markdown",
      PageAuthor.HUMAN
    );
    await tx.page.create({
      data: {
        ...owner,
        title: doc.title,
        createdBy: PageAuthor.HUMAN,
        position: 1024 * (index + 1),
        projectId: doc.project ? (projectIds.get(doc.project) ?? null) : null,
        blocks: {
          create: blocks.map((b) => ({
            id: b.id,
            type: b.type,
            content: b.content,
            position: b.position,
            createdBy: PageAuthor.HUMAN,
          })),
        },
      },
    });
  }

  for (const habit of SANDBOX_HABITS) {
    await tx.habit.create({
      data: {
        ...owner,
        title: habit.title,
        at: habit.at,
        estimatedMinutes: habit.minutes,
        quota: habit.perWeek,
        targetOccurrencesPerWeek: habit.perWeek,
        daysOfWeek: [...habit.daysOfWeek],
        completions: {
          create: habit.doneDaysAgo.map((ago) => ({
            date: newDate(`${shiftDay(today, -ago)}T00:00:00.000Z`),
          })),
        },
      },
    });
  }

  for (const memory of SANDBOX_MEMORIES) {
    await tx.agentMemory.create({
      data: { ...owner, kind: memory.kind, content: memory.content },
    });
  }

  return {
    projects: SANDBOX_PROJECTS.length,
    tasks: SANDBOX_TASKS.length,
    events: SANDBOX_EVENTS.length,
    pages: SANDBOX_DOCS.length,
    habits: SANDBOX_HABITS.length,
    goals: 1,
    memories: SANDBOX_MEMORIES.length,
  };
}

/**
 * Removes everything the account made, keeping the account itself (its id,
 * sign-in, settings, plan and workspace) so a reviewer's MCP connection is
 * still the same account in the morning.
 */
export async function wipeSandboxContent(tx: Tx, userId: string) {
  const byUser = { where: { userId } };
  // Logs and AI first: they point at rows removed below.
  await tx.agentAction.deleteMany(byUser);
  await tx.agentRun.deleteMany(byUser);
  await tx.aiPageChangeProposal.deleteMany(byUser);
  await tx.aiMessage.deleteMany(byUser);
  await tx.aiConversation.deleteMany(byUser);
  await tx.aiUsage.deleteMany(byUser);
  await tx.agentMemory.deleteMany(byUser);
  await tx.notificationRead.deleteMany(byUser);
  await tx.notification.deleteMany(byUser);
  await tx.proactiveNudge.deleteMany(byUser);
  await tx.taskReminder.deleteMany(byUser);
  await tx.morningBrief.deleteMany(byUser);
  await tx.dailyAgenda.deleteMany(byUser);
  await tx.dailyHighlight.deleteMany(byUser);
  await tx.weekFocus.deleteMany(byUser);
  await tx.weeklyFocusTarget.deleteMany(byUser);
  await tx.focusSession.deleteMany(byUser);
  await tx.timeEntry.deleteMany(byUser);
  await tx.scheduledBlock.deleteMany(byUser);
  await tx.closedDay.deleteMany(byUser);
  await tx.importItemMap.deleteMany(byUser);
  await tx.importRun.deleteMany(byUser);
  // Tasks: recurrence instances and habit tasks refuse a cascade, so the
  // links go first.
  await tx.task.updateMany({
    where: { userId, recurrenceMasterId: { not: null } },
    data: { recurrenceMasterId: null },
  });
  await tx.task.deleteMany(byUser);
  await tx.habit.deleteMany(byUser);
  await tx.goalCheckIn.deleteMany(byUser);
  await tx.goal.deleteMany(byUser);
  await tx.meetingNoteProposal.deleteMany({
    where: { OR: [{ createdById: userId }, { page: { userId } }] },
  });
  await tx.page.deleteMany(byUser);
  await tx.pageSmartFolder.deleteMany(byUser);
  await tx.pageFolder.deleteMany(byUser);
  await tx.pageTag.deleteMany(byUser);
  await tx.pageTemplate.deleteMany(byUser);
  await tx.projectHealthUpdate.deleteMany({ where: { project: { userId } } });
  await tx.project.deleteMany(byUser);
  await tx.board.deleteMany(byUser);
  await tx.savedView.deleteMany(byUser);
  await tx.tag.deleteMany(byUser);
  await tx.moodboard.deleteMany({ where: { createdById: userId } });
  await tx.personalBlock.deleteMany(byUser);
  await tx.calendarFeed.deleteMany(byUser);
}

/**
 * Connections older than a day are cut: OAuth access and refresh tokens
 * (an MCP client that refreshed within the day keeps working, the refresh
 * issues a fresh row) and the personal connector token.
 */
export async function revokeStaleSandboxTokens(
  tx: Tx,
  userId: string,
  now: Date
) {
  const cutoff = new Date(now.getTime() - SANDBOX_TOKEN_GRACE_MS);
  const revoked = await tx.oAuthToken.updateMany({
    where: { userId, revokedAt: null, createdAt: { lt: cutoff } },
    data: { revokedAt: now },
  });
  await tx.oAuthAuthorizationCode.deleteMany({
    where: { userId, createdAt: { lt: cutoff } },
  });
  // Sandbox accounts cannot mint one; any that exists goes.
  await tx.connectorSettings.updateMany({
    where: { userId, tokenHash: { not: null } },
    data: { tokenHash: null, tokenPreview: null, tokenExpiresAt: null },
  });
  return revoked.count;
}

export interface SandboxResetResult {
  userId: string;
  kind: SandboxKind;
  tokensRevoked: number;
  seeded: SandboxSeedCounts;
}

/** Wipes and reseeds one sandbox account. Refuses any other account. */
export async function resetSandboxAccount(
  userId: string,
  now: Date = newDate()
): Promise<SandboxResetResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, sandboxKind: true },
  });
  if (!user?.sandboxKind) {
    throw new Error("Only a sandbox account can be reset.");
  }
  const kind = user.sandboxKind;
  const result = await prisma.$transaction(
    async (tx) => {
      // Checked again inside the transaction that deletes.
      const locked = await tx.user.findUnique({
        where: { id: userId },
        select: { sandboxKind: true },
      });
      if (!locked?.sandboxKind) {
        throw new Error("Only a sandbox account can be reset.");
      }
      const tokensRevoked = await revokeStaleSandboxTokens(tx, userId, now);
      await wipeSandboxContent(tx, userId);
      await ensurePro(tx, userId);
      const workspaceId = await ensureWorkspace(tx, userId);
      const seeded = await seedSandboxContent(tx, {
        userId,
        workspaceId,
        now,
      });
      return { tokensRevoked, seeded };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
  await logger.info(
    "Sandbox account reset",
    { userId, kind, tokensRevoked: result.tokensRevoked },
    LOG_SOURCE
  );
  return { userId, kind, ...result };
}

export interface SandboxRunResult {
  enabled: boolean;
  provisioned: ProvisionOutcome[];
  reset: SandboxResetResult[];
  failed: number;
}

/**
 * The nightly job and the admin button: provision from the env, then wipe and
 * reseed every sandbox account. Does nothing while the flag is off.
 */
export async function resetSandboxAccounts(
  env: Env = process.env,
  now: Date = newDate()
): Promise<SandboxRunResult> {
  if (!(await sandboxAccountsEnabled())) {
    return { enabled: false, provisioned: [], reset: [], failed: 0 };
  }
  const provisioned = await provisionSandboxAccounts(env);
  const accounts = await prisma.user.findMany({
    where: { sandboxKind: { not: null } },
    select: { id: true },
  });
  const reset: SandboxResetResult[] = [];
  let failed = 0;
  for (const account of accounts) {
    try {
      reset.push(await resetSandboxAccount(account.id, now));
    } catch (error) {
      failed += 1;
      await logger.error(
        "Sandbox reset failed",
        {
          userId: account.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return { enabled: true, provisioned, reset, failed };
}
