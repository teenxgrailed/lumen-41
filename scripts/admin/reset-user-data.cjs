#!/usr/bin/env node
/**
 * Wipe ONE user's data while keeping the account, as if they had just signed
 * up: the User row, sign-in (Account, Session, password), role, billing and
 * the personal workspace (emptied, not removed) all stay.
 *
 *   node scripts/admin/reset-user-data.cjs --email someone@example.com
 *       DRY RUN: prints the row count per table that would be deleted.
 *   node scripts/admin/reset-user-data.cjs --email someone@example.com --confirm
 *       Deletes inside ONE transaction (all or nothing), then prints counts.
 *
 * Plain CommonJS so it runs with `node` inside the production image (/app),
 * where only @prisma/client and DATABASE_URL exist; no tsx, no app imports.
 *
 * Scope rule: every statement is filtered by the user's id, by their personal
 * workspace id, or by a relation to a row that is (a task/page/project of that
 * workspace). Content the user authored inside SHARED workspaces belongs to
 * that workspace and is kept. `assertScoped` refuses to run a step whose
 * filter names neither id.
 *
 * Every model with a workspace column is filtered to the personal workspace
 * only: AgentAction, AgentRun, AiConversation, AiMessage, AgentMemory,
 * ImportRun, SchedulingRun and WeeklyFocusTarget rows in shared workspaces
 * are kept. TimeEntry goes only with personal tasks. A Tag goes only if none
 * of its tasks lives outside the personal workspace. Rows without a
 * workspace column (settings, calendars, mail, AiUsage, notifications, ...)
 * are deleted by user id. Side effect in shared workspaces: deleting the
 * user's WorkSchedule rows sets Task.scheduleId / Habit.scheduleId to null on
 * their tasks and habits there (ON DELETE SET NULL); nothing else changes.
 *
 * Provider tokens are NOT revoked at Google, Outlook or Composio. The only
 * revocation helper (src/services/account/account-external-access.ts) is
 * TypeScript wired into the app bundle and cannot be required from here; and
 * a Google calendar grant can be the same grant the person signs in with.
 * The local rows (ConnectedAccount, ExternalIntegration, AIOAuthConnection,
 * CalendarWebhook) are deleted; remote grants and watch channels lapse on
 * their own or can be removed in the provider's account settings.
 * Blobs referenced by deleted PageAsset rows are not removed from storage.
 *
 * Models deliberately KEPT (derived from prisma/schema.prisma, 2026-10-12):
 *   Account identity and auth: User (only onboarding fields reset), Account,
 *     Session, VerificationToken, PasswordReset, AccountReauthentication,
 *     AccountDeletionRequest.
 *   Billing and entitlements: Subscription, LifetimeHold, TrialGrant,
 *     CreemWebhookEvent, CreemSubscriptionCursor.
 *   Workspaces: Workspace (personal one emptied), WorkspaceMember (every
 *     membership, including other users' workspaces).
 *   Admin/operator data: FeatureFlag, FeatureFlagOverride, BugReport,
 *     BugReportAttachment, SystemSettings, BetaSettings, Log, Waitlist,
 *     PendingWaitlist, AppWaitlist, CronState (global row; pendingUserIds is a queue hint).
 *   Rows the user wrote on OTHER people's things: tasks, projects, pages,
 *     boards, moodboards, templates in SHARED workspaces; PageComment,
 *     PageRevision, PageFormSubmission, PageAccessGrant, MoodboardAccessGrant
 *     and TaskWait on items outside the personal workspace; WorkspaceInvite
 *     sent into shared workspaces; TaskActivity, ProjectBlocker and
 *     ProjectHealthUpdate authored there.
 */
"use strict";

const NOTHING = { id: { in: [] } };

function parseArgs(argv) {
  const args = { email: null, confirm: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--email") args.email = argv[(i += 1)] ?? null;
    else if (arg.startsWith("--email=")) args.email = arg.slice(8);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.email) args.email = args.email.trim();
  return args;
}

/** OR of the clauses that exist; matches nothing when none do. */
function any(...clauses) {
  const present = clauses.filter(Boolean);
  if (present.length === 0) return NOTHING;
  if (present.length === 1) return present[0];
  return { OR: present };
}

/**
 * The ordered plan. Children before parents, so every count is reported per
 * table and no foreign key with RESTRICT/NO ACTION is hit on the way.
 */
function buildPlan(userId, workspaceId) {
  if (!userId) throw new Error("buildPlan needs a user id");
  const uid = { userId };
  const ws = workspaceId ? { workspaceId } : null;
  // Rows of the personal workspace, plus legacy rows that predate workspaces.
  const legacy = { workspaceId: null, userId };
  const T = any(ws, legacy); // Task
  const P = any(ws, legacy); // Project
  const G = any(ws, legacy); // Page
  const B = any(ws, legacy); // Board
  const wsOnly = any(ws); // Moodboard, ProjectTemplate, Habit
  // Children of workspace-only parents; nothing at all without a workspace.
  const viaWs = (relation) =>
    wsOnly === NOTHING ? NOTHING : { [relation]: wsOnly };

  const steps = [
    // AI, agent and imports
    ["AgentAction", "agentAction", wsOnly],
    ["AgentRun", "agentRun", wsOnly],
    ["AiMessage", "aiMessage", any(ws, viaWs("conversation"))],
    ["AiConversation", "aiConversation", wsOnly],
    ["AgentMemory", "agentMemory", wsOnly],
    ["AiUsage", "aiUsage", uid],
    ["MorningBrief", "morningBrief", uid],
    ["StarterGameState", "starterGameState", uid],
    ["AiPageChangeProposal", "aiPageChangeProposal", any(uid, { page: G })],
    ["AISettings", "aISettings", uid],
    ["AIOAuthConnection", "aIOAuthConnection", uid],
    ["AIOAuthState", "aIOAuthState", uid],
    ["OAuthToken", "oAuthToken", uid],
    ["OAuthAuthorizationCode", "oAuthAuthorizationCode", uid],
    ["DesktopAuthCode", "desktopAuthCode", uid],
    ["ImportItemMap", "importItemMap", uid],
    ["ImportRun", "importRun", wsOnly],

    // Scheduling, focus, reminders
    ["SchedulingRun", "schedulingRun", any(ws, legacy)],
    ["ProactiveNudge", "proactiveNudge", any(uid, { task: T })],
    ["TaskReminder", "taskReminder", any(uid, { task: T })],
    ["ScheduledBlock", "scheduledBlock", any(uid, { task: T })],
    ["TimeEntry", "timeEntry", { task: T }],
    ["FocusSession", "focusSession", uid],
    ["FocusStats", "focusStats", uid],
    ["DailyHighlight", "dailyHighlight", any(uid, ws)],
    ["WeekFocus", "weekFocus", any(uid, ws)],
    ["DailyAgenda", "dailyAgenda", uid],
    ["ClosedDay", "closedDay", uid],
    ["PersonalBlock", "personalBlock", uid],
    ["WeeklyFocusTarget", "weeklyFocusTarget", wsOnly],
    ["IdempotencyRecord", "idempotencyRecord", uid],

    // Task sync and task children
    ["TaskChange", "taskChange", uid],
    [
      "TaskListMapping",
      "taskListMapping",
      any({ provider: uid }, { project: P }),
    ],
    ["TaskProvider", "taskProvider", uid],
    ["TaskActivity", "taskActivity", any(ws, { task: T })],
    [
      "TaskDependency",
      "taskDependency",
      any(ws, { blocker: T }, { blocked: T }),
    ],
    [
      "ProjectBlocker",
      "projectBlocker",
      any({ project: P }, { task: T }, { blockerTask: T }),
    ],
    ["TaskPart", "taskPart", { task: T }],
    ["TaskWait", "taskWait", { task: T }],
    ["TaskAttachment", "taskAttachment", { task: T }],
    // Recurrence instances point at their master with ON DELETE RESTRICT.
    ["Task", "task", T, { unlink: { recurrenceMasterId: null } }],

    // Projects and templates
    ["ProjectHealthUpdate", "projectHealthUpdate", any(ws, { project: P })],
    ["ProjectStage", "projectStage", { project: P }],
    ["Project", "project", P],
    [
      "ProjectTemplateDependency",
      "projectTemplateDependency",
      viaWs("template"),
    ],
    ["ProjectTemplateTask", "projectTemplateTask", viaWs("template")],
    ["ProjectTemplateRole", "projectTemplateRole", viaWs("template")],
    ["ProjectTemplateStage", "projectTemplateStage", viaWs("template")],
    ["ProjectTemplate", "projectTemplate", wsOnly],

    // Habits (after tasks: Task.habitId is ON DELETE RESTRICT)
    ["HabitCompletion", "habitCompletion", viaWs("habit")],
    ["Habit", "habit", wsOnly],

    // Pages, documents, page databases
    ["MeetingNoteProposal", "meetingNoteProposal", any(ws, { page: G })],
    ["PageView", "pageView", any(uid, { page: G })],
    ["PageAiAccess", "pageAiAccess", { page: G }],
    ["PagePublication", "pagePublication", { page: G }],
    ["PageCollaborationSession", "pageCollaborationSession", { page: G }],
    ["PageCollaborationState", "pageCollaborationState", { page: G }],
    ["PageAccessGrant", "pageAccessGrant", { page: G }],
    ["PageRevision", "pageRevision", { page: G }],
    ["PageComment", "pageComment", { page: G }],
    ["PageFormSubmission", "pageFormSubmission", { form: { page: G } }],
    ["PageForm", "pageForm", { page: G }],
    [
      "DatabaseValue",
      "databaseValue",
      any(
        { record: { database: { page: G } } },
        { record: { page: G } },
        { property: { database: { page: G } } }
      ),
    ],
    [
      "DatabaseRecord",
      "databaseRecord",
      any({ database: { page: G } }, { page: G }),
    ],
    ["DatabaseView", "databaseView", { database: { page: G } }],
    ["DatabaseProperty", "databaseProperty", { database: { page: G } }],
    ["PageDatabase", "pageDatabase", { page: G }],
    ["PageAsset", "pageAsset", { page: G }],
    ["PageBlock", "pageBlock", { page: G }],
    ["Page", "page", G],
    ["PageFolder", "pageFolder", any(ws, legacy)],
    ["PageTag", "pageTag", any(ws, legacy)],
    ["PageSmartFolder", "pageSmartFolder", any(ws, legacy)],
    ["PageTemplate", "pageTemplate", uid],

    // Boards and saved views
    ["SavedView", "savedView", any(ws, legacy)],
    ["BoardColumn", "boardColumn", { board: B }],
    ["Board", "board", B],

    // Moodboards
    [
      "MoodboardItemComment",
      "moodboardItemComment",
      wsOnly === NOTHING ? NOTHING : { item: viaWs("moodboard") },
    ],
    ["MoodboardItem", "moodboardItem", viaWs("moodboard")],
    ["MoodboardAsset", "moodboardAsset", viaWs("moodboard")],
    ["MoodboardSnapshot", "moodboardSnapshot", viaWs("moodboard")],
    [
      "MoodboardCollaborationState",
      "moodboardCollaborationState",
      viaWs("moodboard"),
    ],
    ["MoodboardAccessGrant", "moodboardAccessGrant", viaWs("moodboard")],
    ["Moodboard", "moodboard", wsOnly],

    // Calendars, mail, connectors, API access
    ["CalendarWebhook", "calendarWebhook", { feed: uid }],
    ["CalendarEvent", "calendarEvent", { feed: uid }],
    ["CalendarFeed", "calendarFeed", uid],
    ["MailMessage", "mailMessage", { account: uid }],
    ["MailAccount", "mailAccount", uid],
    ["MailFocusedSplit", "mailFocusedSplit", uid],
    ["ConnectedAccount", "connectedAccount", uid],
    ["PinterestConnection", "pinterestConnection", uid],
    ["ExternalIntegration", "externalIntegration", uid],
    ["ConnectorSettings", "connectorSettings", uid],
    ["AccessLink", "accessLink", uid],
    ["PushSubscription", "pushSubscription", uid],
    ["Notification", "notification", uid],
    ["NotificationRead", "notificationRead", uid],
    ["Booking", "booking", any({ ownerId: userId }, { bookingPage: uid })],
    ["BookingPage", "bookingPage", uid],
    ["Tag", "tag", { userId, tasks: { none: { NOT: T } } }],

    // Settings: the app upserts each with its defaults on next read.
    ["UserSettings", "userSettings", uid],
    ["CalendarSettings", "calendarSettings", uid],
    ["NotificationSettings", "notificationSettings", uid],
    ["UserCustomization", "userCustomization", uid],
    ["IntegrationSettings", "integrationSettings", uid],
    ["DataSettings", "dataSettings", uid],
    ["AutoScheduleSettings", "autoScheduleSettings", uid],
    ["SchedulingPreferences", "schedulingPreferences", uid],
    ["FocusPreferences", "focusPreferences", uid],
    ["EnergyProfile", "energyProfile", uid],
    ["EnergyProfileWindow", "energyProfileWindow", uid],
    ["FlexibleHoursOverride", "flexibleHoursOverride", uid],
    ["WorkScheduleWindow", "workScheduleWindow", { schedule: uid }],
    ["WorkSchedule", "workSchedule", uid],

    // Misc per-user records
    ["JobRecord", "jobRecord", uid],
    ["DataExportRequest", "dataExportRequest", uid],
    ["WorkspaceInvite", "workspaceInvite", wsOnly],
  ];

  return steps.map(([table, delegate, where, extra]) => {
    assertScoped(table, where, userId, workspaceId);
    return { table, delegate, where, ...(extra || {}) };
  });
}

/** Every filter must name the user id or the personal workspace id. */
function assertScoped(table, where, userId, workspaceId) {
  if (where === NOTHING) return;
  const text = JSON.stringify(where);
  const scoped =
    text.includes(JSON.stringify(userId)) ||
    (workspaceId && text.includes(JSON.stringify(workspaceId)));
  if (!scoped) {
    throw new Error(`Refusing unscoped filter for ${table}: ${text}`);
  }
}

/** Share invites carry no foreign key, only the page/moodboard id. */
async function shareInviteWhere(client, plan) {
  const pageStep = plan.find((step) => step.table === "Page");
  const boardStep = plan.find((step) => step.table === "Moodboard");
  const [pages, moodboards] = await Promise.all([
    client.page.findMany({ where: pageStep.where, select: { id: true } }),
    client.moodboard.findMany({ where: boardStep.where, select: { id: true } }),
  ]);
  const clauses = [];
  if (pages.length > 0) {
    clauses.push({
      resourceKind: "page",
      resourceId: { in: pages.map((p) => p.id) },
    });
  }
  if (moodboards.length > 0) {
    clauses.push({
      resourceKind: "moodboard",
      resourceId: { in: moodboards.map((m) => m.id) },
    });
  }
  if (clauses.length === 0) return NOTHING;
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

const USER_RESET = { onboardingCompletedAt: null, onboardingUses: [] };

async function findTarget(client, email) {
  const users = await client.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      role: true,
      onboardingCompletedAt: true,
      personalWorkspace: { select: { id: true, name: true, kind: true } },
    },
    take: 2,
  });
  if (users.length > 1) {
    throw new Error(`More than one user matches ${email}; refusing.`);
  }
  return users[0] ?? null;
}

async function countPlan(client, plan, inviteWhere) {
  const counts = [];
  for (const step of plan) {
    counts.push([
      step.table,
      await client[step.delegate].count({ where: step.where }),
    ]);
  }
  counts.push([
    "ShareInvite",
    await client.shareInvite.count({ where: inviteWhere }),
  ]);
  return counts;
}

async function executePlan(client, plan, inviteWhere, userId) {
  const counts = [];
  counts.push([
    "ShareInvite",
    (await client.shareInvite.deleteMany({ where: inviteWhere })).count,
  ]);
  for (const step of plan) {
    if (step.unlink) {
      await client[step.delegate].updateMany({
        where: step.where,
        data: step.unlink,
      });
    }
    const result = await client[step.delegate].deleteMany({
      where: step.where,
    });
    counts.push([step.table, result.count]);
  }
  await client.user.update({ where: { id: userId }, data: USER_RESET });
  return counts;
}

function printCounts(title, counts) {
  const width = Math.max(...counts.map(([t]) => t.length));
  const nonZero = counts.filter(([, n]) => n > 0);
  console.log(`\n${title}`);
  for (const [table, n] of nonZero) {
    console.log(`  ${table.padEnd(width)}  ${n}`);
  }
  const zero = counts.length - nonZero.length;
  const total = nonZero.reduce((sum, [, n]) => sum + n, 0);
  console.log(
    `  ${"TOTAL".padEnd(width)}  ${total}  (${zero} tables already empty)`
  );
}

async function run(client, args) {
  const user = await findTarget(client, args.email);
  if (!user) {
    console.error(`No user with email ${args.email}. Nothing done.`);
    return 1;
  }
  if (user.personalWorkspace && user.personalWorkspace.kind !== "PERSONAL") {
    console.error(
      `Workspace ${user.personalWorkspace.id} is linked as personal but has kind=${user.personalWorkspace.kind}; refusing. Nothing done.`
    );
    return 1;
  }
  const workspaceId = user.personalWorkspace ? user.personalWorkspace.id : null;
  console.log(`User      ${user.id}  ${user.email}  role=${user.role}`);
  console.log(
    `Workspace ${workspaceId ?? "(no personal workspace: only user-owned rows)"}`
  );
  console.log(
    "Kept: User, Account, Session, password, role, Subscription/Lifetime/Trial, workspace + memberships."
  );

  const plan = buildPlan(user.id, workspaceId);
  const inviteWhere = await shareInviteWhere(client, plan);

  if (!args.confirm) {
    printCounts(
      "DRY RUN - rows that would be deleted:",
      await countPlan(client, plan, inviteWhere)
    );
    console.log(
      `  User: onboardingCompletedAt ${user.onboardingCompletedAt ? "-> null" : "already null"}, onboardingUses -> []`
    );
    console.log(
      "\nWARNING: run while the user is signed out; the transaction can wait on worker locks."
    );
    console.log("Nothing was changed. Re-run with --confirm to delete.");
    return 0;
  }

  const started = Date.now();
  const deleted = await client.$transaction(
    (tx) => executePlan(tx, plan, inviteWhere, user.id),
    { maxWait: 30_000, timeout: 15 * 60_000 }
  );
  printCounts("DELETED (one transaction, committed):", deleted);
  console.log("  User: onboarding reset; onboarding will run on next sign-in.");
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  console.log(
    "Not done: provider tokens were not revoked at Google/Outlook/Composio; stored blobs of deleted page assets were not removed."
  );
  return 0;
}

const USAGE =
  "Usage: node scripts/admin/reset-user-data.cjs --email <email> [--confirm]";

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  if (args.help || !args.email) {
    console.error(USAGE);
    return args.help ? 0 : 2;
  }
  const { PrismaClient } = require("@prisma/client");
  const client = new PrismaClient();
  try {
    return await run(client, args);
  } catch (error) {
    console.error(
      "FAILED. Nothing was committed (the transaction rolls back as a whole):"
    );
    console.error(error);
    return 1;
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = {
  NOTHING,
  USER_RESET,
  any,
  assertScoped,
  buildPlan,
  countPlan,
  executePlan,
  parseArgs,
  run,
  shareInviteWhere,
};
