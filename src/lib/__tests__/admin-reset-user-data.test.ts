import { Prisma } from "@prisma/client";

/* The admin scripts are plain CommonJS so they run with `node` inside the
   production image; jest loads them the same way. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reset = require("../../../scripts/admin/reset-user-data.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const setRole = require("../../../scripts/admin/set-role.cjs");

const USER_ID = "user_target_123";
const WORKSPACE_ID = "ws_personal_456";

/** Models the reset must never write to. */
const KEPT = [
  "User",
  "Account",
  "Session",
  "VerificationToken",
  "PasswordReset",
  "AccountReauthentication",
  "AccountDeletionRequest",
  "Subscription",
  "LifetimeHold",
  "TrialGrant",
  "CreemWebhookEvent",
  "CreemSubscriptionCursor",
  "Workspace",
  "WorkspaceMember",
  "FeatureFlagOverride",
  "BugReport",
];

function delegateName(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

type Call = { delegate: string; method: string; args: unknown };

function mockClient(findUser: unknown[] = []) {
  const calls: Call[] = [];
  const delegate = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => async (args: unknown) => {
          calls.push({ delegate: name, method, args });
          if (method === "count") return 0;
          if (method === "findMany") return name === "user" ? findUser : [];
          if (method === "deleteMany" || method === "updateMany")
            return { count: 0 };
          return {};
        },
      }
    );
  const client: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "$transaction")
          return async (fn: (tx: unknown) => unknown) => {
            calls.push({ delegate: "$transaction", method: "call", args: {} });
            return fn(client);
          };
        return delegate(prop);
      },
    }
  );
  return { client, calls };
}

const TARGET = {
  id: USER_ID,
  email: "someone@example.com",
  role: "user",
  onboardingCompletedAt: null,
  personalWorkspace: { id: WORKSPACE_ID, name: "Me", kind: "PERSONAL" },
};

describe("reset-user-data plan", () => {
  const plan = reset.buildPlan(USER_ID, WORKSPACE_ID) as Array<{
    table: string;
    delegate: string;
    where: unknown;
  }>;

  it("scopes every filter by the user id or the personal workspace id", () => {
    for (const step of plan) {
      const text = JSON.stringify(step.where);
      expect(text.includes(USER_ID) || text.includes(WORKSPACE_ID)).toBe(true);
    }
  });

  it("refuses a filter that names neither id", () => {
    expect(() =>
      reset.assertScoped("Task", { userId: "someone-else" }, USER_ID, null)
    ).toThrow(/unscoped/);
  });

  it("names only real Prisma delegates and never a kept model", () => {
    const models = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
    for (const step of plan) {
      expect(models.has(step.table)).toBe(true);
      expect(step.delegate).toBe(delegateName(step.table));
      expect(KEPT).not.toContain(step.table);
    }
  });

  it("decides every model that points at a User or a Workspace", () => {
    const planned = new Set([...plan.map((s) => s.table), "ShareInvite"]);
    const undecided = Prisma.dmmf.datamodel.models
      .filter((model) =>
        model.fields.some(
          (f) =>
            f.kind === "object" &&
            (f.type === "User" || f.type === "Workspace") &&
            (f.relationFromFields?.length ?? 0) > 0
        )
      )
      .map((model) => model.name)
      .filter((name) => !planned.has(name) && !KEPT.includes(name));
    // A new user- or workspace-owned model must be added to the plan or to
    // the kept list in scripts/admin/reset-user-data.cjs and here.
    expect(undecided).toEqual([]);
  });

  it("time entries go only with personal tasks, never by bare user id", () => {
    const step = plan.find((s) => s.table === "TimeEntry");
    expect(step?.where).toEqual({ task: expect.any(Object) });
    expect(step?.where).not.toHaveProperty("userId");
    expect(step?.where).not.toHaveProperty("OR");
  });

  it("keeps tags attached to tasks outside the personal workspace", () => {
    const step = plan.find((s) => s.table === "Tag");
    const task = plan.find((s) => s.table === "Task");
    expect(step?.where).toEqual({
      userId: USER_ID,
      tasks: { none: { NOT: task?.where } },
    });
  });

  it("filters workspace-scoped AI and agent rows to the personal workspace", () => {
    for (const table of [
      "AgentAction",
      "AgentRun",
      "AiConversation",
      "AgentMemory",
      "ImportRun",
      "WeeklyFocusTarget",
    ]) {
      expect(plan.find((s) => s.table === table)?.where).toEqual({
        workspaceId: WORKSPACE_ID,
      });
    }
  });

  it("without a personal workspace, workspace-only steps match nothing", () => {
    const noWs = reset.buildPlan(USER_ID, null) as typeof plan;
    const moodboard = noWs.find((s) => s.table === "Moodboard");
    expect(moodboard?.where).toEqual(reset.NOTHING);
  });
});

describe("reset-user-data run", () => {
  it("dry run only counts", async () => {
    const { client, calls } = mockClient([TARGET]);
    const code = await reset.run(client, {
      email: TARGET.email,
      confirm: false,
    });
    expect(code).toBe(0);
    const writes = calls.filter((c) =>
      ["deleteMany", "updateMany", "update", "delete", "call"].includes(
        c.method
      )
    );
    expect(writes).toEqual([]);
  });

  it("confirm writes in one transaction and leaves kept models alone", async () => {
    const { client, calls } = mockClient([TARGET]);
    const code = await reset.run(client, {
      email: TARGET.email,
      confirm: true,
    });
    expect(code).toBe(0);
    expect(calls.filter((c) => c.delegate === "$transaction")).toHaveLength(1);
    const writes = calls.filter((c) =>
      [
        "deleteMany",
        "updateMany",
        "update",
        "delete",
        "create",
        "upsert",
      ].includes(c.method)
    );
    for (const call of writes) {
      if (call.delegate === "user") {
        expect(call).toEqual({
          delegate: "user",
          method: "update",
          args: { where: { id: USER_ID }, data: reset.USER_RESET },
        });
        continue;
      }
      expect(KEPT.map(delegateName)).not.toContain(call.delegate);
      const { where } = call.args as { where: unknown };
      if (JSON.stringify(where) === JSON.stringify(reset.NOTHING)) continue;
      const text = JSON.stringify(where);
      expect(text.includes(USER_ID) || text.includes(WORKSPACE_ID)).toBe(true);
    }
    // Only the recurrence link is cleared before tasks are deleted.
    const unlinks = writes.filter((c) => c.method === "updateMany");
    expect(unlinks).toHaveLength(1);
    expect(unlinks[0].delegate).toBe("task");
  });

  it("refuses a linked workspace that is not PERSONAL, without writing", async () => {
    const shared = {
      ...TARGET,
      personalWorkspace: { ...TARGET.personalWorkspace, kind: "SHARED" },
    };
    const { client, calls } = mockClient([shared]);
    const code = await reset.run(client, {
      email: TARGET.email,
      confirm: true,
    });
    expect(code).toBe(1);
    expect(calls.map((c) => `${c.delegate}.${c.method}`)).toEqual([
      "user.findMany",
    ]);
  });

  it("refuses an ambiguous email", async () => {
    const { client } = mockClient([TARGET, { ...TARGET, id: "other" }]);
    await expect(
      reset.run(client, { email: TARGET.email, confirm: true })
    ).rejects.toThrow(/More than one user/);
  });

  it("parses arguments", () => {
    expect(reset.parseArgs(["--email", " a@b.c ", "--confirm"])).toEqual({
      email: "a@b.c",
      confirm: true,
      help: false,
    });
    expect(() => reset.parseArgs(["--force"])).toThrow(/Unknown/);
  });
});

describe("set-role", () => {
  it("rejects unknown roles", () => {
    expect(() =>
      setRole.parseArgs(["--email", "a@b.c", "--role", "root"])
    ).toThrow(/--role/);
  });

  it("dry run does not write; confirm updates only that user's role", async () => {
    const dry = mockClient([TARGET]);
    await setRole.run(dry.client, {
      email: TARGET.email,
      role: "admin",
      confirm: false,
    });
    expect(dry.calls.filter((c) => c.method === "update")).toEqual([]);

    const live = mockClient([TARGET]);
    await setRole.run(live.client, {
      email: TARGET.email,
      role: "admin",
      confirm: true,
    });
    const updates = live.calls.filter((c) => c.method === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args).toMatchObject({
      where: { id: USER_ID },
      data: { role: "admin" },
    });
  });
});
