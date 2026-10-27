import { recordAdminAudit } from "@/services/admin/audit";
import { listAdminFeatureFlags } from "@/services/admin/feature-flags";
import { queryAdminLogs } from "@/services/admin/logs";
import { getAdminOperations } from "@/services/admin/operations";
import {
  getAdminOverview,
  getAdminSignupStats,
} from "@/services/admin/overview";
import { getAdminUserDetail, searchAdminUsers } from "@/services/admin/users";
import { listBugReports } from "@/services/bug-reports/bug-report-service";
import { z } from "zod";

import { isAdminUserId } from "@/lib/auth/admin-role";
import { ADMIN_READ_SCOPE, type McpScope } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

import type { McpTool, McpToolContext, McpToolResult } from "./tools";

/**
 * Read-only MCP view of the Admin area (`needt.admin.read`).
 *
 * - Every tool reads through the same service the admin pages use; no tool
 *   writes, and there is deliberately no grant, toggle, delete or
 *   impersonation here.
 * - The transport (`/api/mcp`) refuses a call without the scope or from a
 *   person who is not an admin right now, and rate-limits these calls on
 *   their own. Each tool checks both again, so a call that reaches it some
 *   other way is refused the same.
 * - Every successful read is written to the admin audit log before the data
 *   is returned; if that write fails the read fails.
 * - Output is built field by field: no password hash, token, provider id,
 *   payment id or secret is ever copied out.
 */

export const ADMIN_TOOL_LIMIT_MAX = 50;
/** Per person, calls to admin tools. */
export const MCP_ADMIN_LIMIT_PER_MINUTE = 30;

const TEXT_CAP = 2000;
const LOG_MESSAGE_CAP = 1000;
const METADATA_VALUE_CAP = 300;

/** Keys never copied out of a log row's metadata, whatever their value. */
const SECRET_KEY =
  /pass(word)?|secret|token|authori[sz]ation|cookie|api[-_]?key|private|hash|session|bearer|credential|signature/i;

function result(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function refusal(error: string): McpToolResult {
  return { ...result({ error }), isError: true };
}

const cap = (value: string | null | undefined, max = TEXT_CAP) =>
  value == null ? null : value.length > max ? `${value.slice(0, max)}…` : value;

/** BullMQ job counts come back as a loose record; read one as a number. */
const count = (queue: object, key: string) => {
  const value = (queue as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
};

const iso = (date: Date | string | null | undefined) =>
  date == null ? null : date instanceof Date ? date.toISOString() : date;

/**
 * A log row's structured data without anything that looks like a credential:
 * secret-looking keys are dropped, long strings are cut, depth is bounded.
 */
export function scrubMetadata(value: unknown, depth = 0): unknown {
  if (value == null) return null;
  if (typeof value === "string") return cap(value, METADATA_VALUE_CAP);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return "[nested]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrubMetadata(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 30)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = scrubMetadata(item, depth + 1);
    }
    return out;
  }
  return null;
}

/** Whether this call may read admin data: the scope, and the role right now. */
export async function adminCallAllowed(ctx: {
  userId: string;
  auth: { scopes: readonly McpScope[] };
}): Promise<boolean> {
  return (
    ctx.auth.scopes.includes(ADMIN_READ_SCOPE) &&
    (await isAdminUserId(ctx.userId))
  );
}

async function audited(
  ctx: McpToolContext,
  tool: string,
  details: Record<string, string | number | boolean | null>,
  read: () => Promise<unknown>,
  targetUserId?: string | null
): Promise<McpToolResult> {
  if (!(await adminCallAllowed(ctx))) {
    return refusal("Forbidden: this needs an admin with needt.admin.read.");
  }
  await recordAdminAudit({
    actorId: ctx.userId,
    targetUserId: targetUserId ?? null,
    action: "mcp.admin_read",
    details: {
      tool,
      tokenKind: ctx.auth.kind,
      clientId: ctx.auth.clientId ?? null,
      ...details,
    },
  });
  return result(await read());
}

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;
const adminScopes = (): McpScope[] => [ADMIN_READ_SCOPE];

function defineAdminTool<S extends z.ZodTypeAny>(tool: McpTool<S>): McpTool {
  return tool as unknown as McpTool;
}

const pageArgs = {
  limit: z.number().int().min(1).max(ADMIN_TOOL_LIMIT_MAX).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
};

export const ADMIN_TOOLS: McpTool[] = [
  defineAdminTool({
    name: "needt_admin_overview",
    description:
      "Admin only, read only. The Admin Overview in numbers: total users, sign-ups today and in the last 7 days, confirmed vs unconfirmed email, paying plans (Pro, Lifetime), active trials, Free, waitlist size, whether sign-ups are open, and every feature flag's state. MRR is not computed (Pro monthly and yearly are not told apart) and comes back null. Needs needt.admin.read.",
    annotations: readOnly,
    scopes: adminScopes,
    input: z.object({}).strict(),
    invoke: (ctx) =>
      audited(ctx, "needt_admin_overview", {}, async () => {
        const [overview, signups, flags] = await Promise.all([
          getAdminOverview(),
          getAdminSignupStats(),
          listAdminFeatureFlags(),
        ]);
        return {
          users: {
            total: overview.users.total,
            newLast7Days: overview.users.newLast7Days,
            signupsToday: signups.signupsToday,
            signupsLast7Days: signups.signupsLast7Days,
            verified: signups.verified,
            unverified: signups.unverified,
          },
          plans: overview.plans,
          activeTrials: overview.activeTrials,
          waitlist: overview.waitlist,
          signupsOpen: signups.signupsOpen,
          mrr: null,
          flags: flags.map((flag) => ({
            key: flag.key,
            enabled: flag.enabled,
            rolloutPercentage: flag.rolloutPercentage,
          })),
          generatedAt: overview.generatedAt,
        };
      }),
  }),
  defineAdminTool({
    name: "needt_admin_users",
    description:
      "Admin only, read only. Find accounts by part of an email (empty lists the newest), paged: id, email, name, role, plan, created, email confirmed, last sign-in. With userId, one account in full: plan and subscription state, trial end, sign-in/calendar/mail provider names, scheduled deletion, and the admin audit trail for it. Never returns password hashes, tokens, provider or payment ids. Needs needt.admin.read.",
    annotations: readOnly,
    scopes: adminScopes,
    input: z
      .object({
        query: z.string().max(120).optional(),
        userId: z.string().min(1).max(64).optional(),
        ...pageArgs,
      })
      .strict(),
    invoke: (ctx, args) =>
      audited(
        ctx,
        "needt_admin_users",
        {
          userId: args.userId ?? null,
          query: args.query ?? null,
          page: args.page ?? 1,
        },
        async () => {
          if (args.userId) {
            const user = await getAdminUserDetail(args.userId);
            if (!user) return { user: null };
            const audit = await prisma.adminAuditLog.findMany({
              where: { targetUserId: args.userId },
              orderBy: { createdAt: "desc" },
              take: 20,
              select: { action: true, actorId: true, createdAt: true },
            });
            return {
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                plan: user.plan,
                createdAt: user.createdAt,
                verified: user.verified,
                lastSignInAt: user.lastSignInAt,
                isActive: user.isActive,
                trialEndsAt: user.trialEndsAt,
                subscription: user.subscription
                  ? {
                      plan: user.subscription.plan,
                      status: user.subscription.status,
                      currentPeriodEnd: user.subscription.currentPeriodEnd,
                      manual: user.subscription.manual,
                    }
                  : null,
                providers: {
                  signIn: user.providers.signIn,
                  calendar: user.providers.calendar,
                  mail: user.providers.mail,
                },
                deletionScheduledFor: user.deletionScheduledFor,
              },
              audit: audit.map((row) => ({
                action: row.action,
                actorId: row.actorId,
                createdAt: iso(row.createdAt),
              })),
            };
          }
          const limit = args.limit ?? 25;
          const page = args.page ?? 1;
          const rows = await searchAdminUsers(args.query ?? "", undefined, {
            offset: (page - 1) * limit,
            limit: limit + 1,
          });
          return {
            users: rows.slice(0, limit).map((row) => ({
              id: row.id,
              email: row.email,
              name: row.name,
              role: row.role,
              plan: row.plan,
              createdAt: row.createdAt,
              verified: row.verified,
              lastSignInAt: row.lastSignInAt,
            })),
            page,
            limit,
            hasMore: rows.length > limit,
          };
        },
        args.userId ?? null
      ),
  }),
  defineAdminTool({
    name: "needt_admin_flags",
    description:
      "Admin only, read only. Every feature flag the code knows plus any stored one, incl. signups_open: key, on/off, rollout %, description, how many per-person overrides, whether the code knows it and whether a row exists. Cannot change a flag. Needs needt.admin.read.",
    annotations: readOnly,
    scopes: adminScopes,
    input: z.object({}).strict(),
    invoke: (ctx) =>
      audited(ctx, "needt_admin_flags", {}, async () => ({
        flags: (await listAdminFeatureFlags()).map((flag) => ({
          key: flag.key,
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          description: flag.description,
          overrides: flag.overrides,
          known: flag.known,
          persisted: flag.persisted,
        })),
      })),
  }),
  defineAdminTool({
    name: "needt_admin_logs",
    description:
      "Admin only, read only. kind app (default): the application log the admin log viewer shows, newest first, filter by level (ERROR, WARN, INFO, DEBUG), source, text and from/to (ISO time); secret-looking metadata keys are dropped. kind audit: the admin audit log (who changed which account, and MCP admin reads). kind jobs: what Operations shows — queue depth, cron state, last good run per source, recent failed scheduling runs, which services are configured. Paged, at most 50 rows. Needs needt.admin.read.",
    annotations: readOnly,
    scopes: adminScopes,
    input: z
      .object({
        kind: z.enum(["app", "audit", "jobs"]).optional(),
        level: z.enum(["ERROR", "WARN", "INFO", "DEBUG"]).optional(),
        source: z.string().max(120).optional(),
        search: z.string().max(200).optional(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        ...pageArgs,
      })
      .strict(),
    invoke: (ctx, args) => {
      const kind = args.kind ?? "app";
      const limit = args.limit ?? 25;
      const page = args.page ?? 1;
      return audited(
        ctx,
        "needt_admin_logs",
        { kind, level: args.level ?? null, page },
        async () => {
          if (kind === "jobs") {
            const ops = await getAdminOperations();
            return {
              kind,
              queues: ops.queues.map((queue) => ({
                name: queue.name,
                waiting: count(queue, "waiting"),
                active: count(queue, "active"),
                failed: count(queue, "failed"),
                severity: queue.severity,
                oldestWaitingAgeMs: queue.oldestWaitingAgeMs,
              })),
              cronStates: ops.cronStates.map((cron) => ({
                id: cron.id,
                lastStartedAt: iso(cron.lastStartedAt),
                lastSucceededAt: iso(cron.lastSucceededAt),
                lastError: cap(cron.lastError, LOG_MESSAGE_CAP),
                overdue: cron.overdue,
              })),
              lastSuccessfulBySource: ops.lastSuccessfulBySource.map((run) => ({
                source: run.source,
                finishedAt: iso(run.finishedAt),
              })),
              failedRuns: ops.failedRuns.map((run) => ({
                id: run.id,
                source: run.source,
                finishedAt: iso(run.finishedAt),
                errorCode: run.errorCode,
                errorMessage: cap(run.errorMessage, LOG_MESSAGE_CAP),
              })),
              services: ops.services.map((entry) => ({
                service: entry.service,
                configured: entry.configured,
                healthy: entry.healthy ?? null,
                detail: cap(entry.detail ?? null, 200),
              })),
            };
          }
          if (kind === "audit") {
            const rows = await prisma.adminAuditLog.findMany({
              where:
                args.from || args.to
                  ? {
                      createdAt: {
                        ...(args.from ? { gte: new Date(args.from) } : {}),
                        ...(args.to ? { lte: new Date(args.to) } : {}),
                      },
                    }
                  : undefined,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              skip: (page - 1) * limit,
              take: limit + 1,
              select: {
                id: true,
                actorId: true,
                targetUserId: true,
                action: true,
                details: true,
                createdAt: true,
              },
            });
            return {
              kind,
              entries: rows.slice(0, limit).map((row) => ({
                id: row.id,
                actorId: row.actorId,
                targetUserId: row.targetUserId,
                action: row.action,
                details: scrubMetadata(row.details),
                createdAt: iso(row.createdAt),
              })),
              page,
              limit,
              hasMore: rows.length > limit,
            };
          }
          const { logs, pagination } = await queryAdminLogs({
            page,
            limit,
            level: args.level,
            source: args.source,
            search: args.search,
            from: args.from,
            to: args.to,
          });
          return {
            kind,
            logs: logs.map((log) => ({
              id: log.id,
              timestamp: iso(log.timestamp),
              level: log.level,
              source: log.source,
              message: cap(log.message, LOG_MESSAGE_CAP),
              metadata: scrubMetadata(log.metadata),
            })),
            page: pagination.current,
            limit: pagination.limit,
            total: pagination.total,
            pages: pagination.pages,
          };
        }
      );
    },
  }),
  defineAdminTool({
    name: "needt_admin_reports",
    description:
      "Admin only, read only. Bug reports people sent from the app, newest first: title, description, steps, expected/actual, severity, status, route, app version, browser, who sent it, GitHub issue link, attachment names and sizes (never the file bytes). Filter by status; paged, at most 50. Needs needt.admin.read.",
    annotations: readOnly,
    scopes: adminScopes,
    input: z
      .object({
        status: z.string().max(40).optional(),
        ...pageArgs,
      })
      .strict(),
    invoke: (ctx, args) => {
      const limit = args.limit ?? 25;
      const page = args.page ?? 1;
      return audited(
        ctx,
        "needt_admin_reports",
        { status: args.status ?? null, page },
        async () => {
          const all = (await listBugReports()).filter(
            (report) => !args.status || report.status === args.status
          );
          const slice = all.slice((page - 1) * limit, page * limit);
          return {
            reports: slice.map((report) => ({
              id: report.id,
              title: cap(report.title, 300),
              description: cap(report.description),
              reproductionSteps: cap(report.reproductionSteps),
              expectedBehavior: cap(report.expectedBehavior),
              actualBehavior: cap(report.actualBehavior),
              severity: report.severity,
              status: report.status,
              route: report.route,
              appVersion: report.appVersion,
              browser: report.browser,
              viewport: report.viewport,
              githubIssueUrl: report.githubIssueUrl,
              createdAt: iso(report.createdAt),
              user: report.user
                ? {
                    id: report.user.id,
                    name: report.user.name,
                    email: report.user.email,
                  }
                : null,
              attachments: report.attachments.map((file) => ({
                id: file.id,
                fileName: file.fileName,
                mimeType: file.mimeType,
                size: file.size,
              })),
            })),
            page,
            limit,
            total: all.length,
            hasMore: page * limit < all.length,
          };
        }
      );
    },
  }),
];

export function isAdminTool(tool: Pick<McpTool, "name">): boolean {
  return ADMIN_TOOLS.some((candidate) => candidate.name === tool.name);
}
