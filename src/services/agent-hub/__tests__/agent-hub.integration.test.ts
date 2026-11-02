/**
 * The whole agent hub loop against a real database, through the MCP route and
 * the owner route handlers: register → create (assigned and "any capable") →
 * inbox by capability → claim (a live lease refuses a second claim) → update
 * extends the lease → complete with a result → memory search finds it;
 * escalate → exactly one owner task; owner approve and answer; a connection
 * without the flag sees no hub tools. Runs with AGENT_HUB_INTEGRATION=1 (CI
 * sets it next to Postgres).
 */
import { NextRequest } from "next/server";

import { POST as mcpPost } from "@/app/api/mcp/route";
import { GET as overviewGet } from "@/app/api/agent-hub/overview/route";
import { POST as ownerItemAction } from "@/app/api/agent-hub/items/[id]/[action]/route";
import { PATCH as ownerNotePatch } from "@/app/api/agent-hub/notes/[id]/route";
import { POST as agentsPost } from "@/app/api/agent-hub/agents/route";
import { DELETE as agentDelete } from "@/app/api/agent-hub/agents/[id]/route";
import { GET as restInboxGet } from "@/app/api/connect/agent-hub/inbox/route";
import {
  generateConnectorToken,
  hashConnectorToken,
} from "@/services/connectors/auth-tokens";
import { WorkspaceKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { createAgentToken } from "../tokens";

const describeIntegration =
  process.env.AGENT_HUB_INTEGRATION === "1" ? describe : describe.skip;

jest.mock("@/lib/security/rate-limit", () => ({
  ...jest.requireActual("@/lib/security/rate-limit"),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
// The owner is whoever the request says is signed in; a bearer-only request
// has no session, exactly as in production.
jest.mock("@/lib/auth/api-auth", () => ({
  ...jest.requireActual("@/lib/auth/api-auth"),
  authenticateRequest: jest.fn(async (request: Request) => {
    const userId = request.headers.get("x-test-session");
    if (!userId) {
      const { NextResponse: Response } = jest.requireActual("next/server");
      return { response: new Response("Unauthorized", { status: 401 }) };
    }
    const { resolveWorkspaceAccess } = jest.requireActual(
      "@/lib/auth/workspace-auth"
    );
    return { userId, workspace: await resolveWorkspaceAccess({ userId }) };
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

// Built at run time so secret scanners do not flag the fixture.
const AWS_KEY = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");

const run = `hub${Date.now().toString(36)}`;
const ownerId = `${run}-owner`;
const ownerWorkspace = `${run}-ws`;
const otherId = `${run}-other`;
const otherWorkspace = `${run}-ws2`;

let claude = ""; // personal connector token (agents.hub via the personal scope set)
let grok = "";
let codex = "";
let otherPersonal = "";
let grokId = "";

async function rpc(token: string, method: string, params?: unknown) {
  const response = await mcpPost(
    new NextRequest("https://mcp.needt.app/api/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  );
  return { status: response.status, body: (await response.json()) as Json };
}

async function tool(
  token: string,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ isError: boolean; data: Json; rpcError?: Json }> {
  const { body } = await rpc(token, "tools/call", { name, arguments: args });
  if (body.error) return { isError: true, data: null, rpcError: body.error };
  return {
    isError: Boolean(body.result.isError),
    data: JSON.parse(body.result.content[0].text),
  };
}

function ownerRequest(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "x-test-session": ownerId, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function ownerAction(id: string, action: string, body?: unknown) {
  const response = await ownerItemAction(
    ownerRequest(`/api/agent-hub/items/${id}/${action}`, "POST", body ?? {}),
    { params: Promise.resolve({ id, action }) }
  );
  return { status: response.status, data: (await response.json()) as Json };
}

async function overview(includeArchived = false) {
  const response = await overviewGet(
    ownerRequest(
      `/api/agent-hub/overview${includeArchived ? "?includeArchived=true" : ""}`,
      "GET"
    )
  );
  return (await response.json()) as Json;
}

const brief = (extra: Record<string, unknown> = {}) => ({
  title: "Record the demo video",
  goal: "Record a 2 minute screen capture of the Google verification demo.",
  doneCriteria: "A public YouTube link to the finished video.",
  context:
    "The Needt app is signed in on the shared browser profile. Show the OAuth consent screen, then the scope list.",
  risks: [],
  assignee: "any",
  requiredSkills: ["youtube-upload"],
  ...extra,
});

describeIntegration("Agent hub (real database)", () => {
  beforeAll(async () => {
    for (const [id, ws] of [
      [ownerId, ownerWorkspace],
      [otherId, otherWorkspace],
    ] as const) {
      await prisma.user.create({
        data: { id, email: `${id}@example.test` },
      });
      await prisma.workspace.create({
        data: {
          id: ws,
          name: "Personal",
          kind: WorkspaceKind.PERSONAL,
          personalOwnerId: id,
        },
      });
      await prisma.workspaceMember.create({
        data: { workspaceId: ws, userId: id, role: "OWNER" },
      });
    }
    // The flag row comes from the migration (off, 0%); only the owner is let in.
    await prisma.featureFlag.upsert({
      where: { key: "agent_hub" },
      update: {},
      create: { key: "agent_hub", enabled: false, rolloutPercentage: 0 },
    });
    await prisma.featureFlagOverride.create({
      data: { flagKey: "agent_hub", userId: ownerId, enabled: true },
    });

    claude = generateConnectorToken();
    await prisma.connectorSettings.create({
      data: { userId: ownerId, tokenHash: hashConnectorToken(claude) },
    });
    otherPersonal = generateConnectorToken();
    await prisma.connectorSettings.create({
      data: { userId: otherId, tokenHash: hashConnectorToken(otherPersonal) },
    });

    const owner = {
      userId: ownerId,
      workspaceId: ownerWorkspace,
      actor: { kind: "owner" as const },
    };
    const g = await createAgentToken(owner, { name: "Grok Bot" });
    grok = g.token;
    grokId = g.agent.id;
    const c = await createAgentToken(owner, { name: "Codex" });
    codex = c.token;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { workspaceId: { in: [ownerWorkspace, otherWorkspace] } },
    });
    await prisma.workspace.deleteMany({
      where: { id: { in: [ownerWorkspace, otherWorkspace] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma.$disconnect();
  });

  it("shows the ten hub tools to the flagged owner and none to anyone else", async () => {
    for (const token of [claude, grok, codex]) {
      const { body } = await rpc(token, "tools/list");
      const names: string[] = body.result.tools.map(
        (t: { name: string }) => t.name
      );
      expect(names.filter((n) => /^needt_(agent|agents|memory)_/.test(n))).toHaveLength(
        10
      );
    }
    const { body } = await rpc(otherPersonal, "tools/list");
    const names: string[] = body.result.tools.map(
      (t: { name: string }) => t.name
    );
    expect(names.some((n) => n.startsWith("needt_agent"))).toBe(false);
    expect(names).not.toContain("needt_memory_write");

    // A call is method-not-found and leaves no agent row behind.
    const call = await rpc(otherPersonal, "tools/call", {
      name: "needt_agent_inbox",
      arguments: {},
    });
    expect(call.body.error.code).toBe(-32601);
    expect(await prisma.hubAgent.count({ where: { userId: otherId } })).toBe(0);

    // REST answers 404 for the same account.
    const rest = await restInboxGet(
      new NextRequest("http://localhost/api/connect/agent-hub/inbox", {
        headers: { authorization: `Bearer ${otherPersonal}` },
      })
    );
    expect(rest.status).toBe(404);
  });

  it("keeps an agent token to the hub scope", async () => {
    const list = await rpc(grok, "tools/call", {
      name: "needt_list",
      arguments: { type: "task" },
    });
    expect(list.status).toBe(403);
  });

  it("registers agents with their skills and marks the caller", async () => {
    const g = await tool(grok, "needt_agent_register", {
      kind: "grok",
      capabilities: "cloud browser, YouTube upload, screen recording",
      skills: ["Browser", "youtube-upload", "screen-recording"],
    });
    expect(g.data.agent).toMatchObject({
      kind: "grok",
      skills: ["browser", "youtube-upload", "screen-recording"],
      self: true,
    });
    await tool(codex, "needt_agent_register", { kind: "codex", skills: ["code"] });

    const list = await tool(grok, "needt_agents_list");
    const rows: Json[] = list.data.agents;
    expect(rows.filter((r) => r.self)).toHaveLength(1);
    expect(rows.find((r) => r.self).name).toBe("Grok Bot");
    expect(JSON.stringify(list.data)).not.toMatch(/tokenHash|needt_agent_/);

    // Another agent's profile is refused.
    const other = await tool(codex, "needt_agent_register", { agentId: grokId });
    expect(other.isError).toBe(true);
    expect(other.data.error).toBe("FORBIDDEN");
  });

  let itemA = ""; // assigned to Grok, declares publish
  let itemB = ""; // any capable: youtube-upload

  it("creates assigned and any-capable items and refuses a thin or leaky brief", async () => {
    const a = await tool(
      claude,
      "needt_agent_task_create",
      brief({
        title: "Publish the demo",
        assignee: "Grok Bot",
        requiredSkills: undefined,
        risks: ["publish"],
        clientRef: "publish-1",
      })
    );
    expect(a.isError ? JSON.stringify(a.data ?? a.rpcError) : false).toBe(false);
    expect(a.data.created).toBe(true);
    itemA = a.data.item.id;
    expect(a.data.item.untrusted).toBe(true);

    const again = await tool(
      claude,
      "needt_agent_task_create",
      brief({
        title: "Publish the demo",
        assignee: "Grok Bot",
        requiredSkills: undefined,
        risks: ["publish"],
        clientRef: "publish-1",
      })
    );
    expect(again.data.created).toBe(false);
    expect(again.data.item.id).toBe(itemA);

    const b = await tool(claude, "needt_agent_task_create", brief());
    expect(b.isError ? JSON.stringify(b.data ?? b.rpcError) : false).toBe(false);
    itemB = b.data.item.id;

    const missing = await tool(
      claude,
      "needt_agent_task_create",
      brief({ doneCriteria: undefined })
    );
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.data)).toContain("doneCriteria");

    const noRisks = await tool(
      claude,
      "needt_agent_task_create",
      brief({ risks: undefined })
    );
    expect(noRisks.isError).toBe(true);
    expect(JSON.stringify(noRisks.data)).toContain("risks");

    const noSkills = await tool(
      claude,
      "needt_agent_task_create",
      brief({ requiredSkills: [] })
    );
    expect(noSkills.data.error).toBe("INVALID");

    const token = ["gh", "p_"].join("") + "a1B2".repeat(9);
    const leaky = await tool(
      claude,
      "needt_agent_task_create",
      brief({ context: `${brief().context} Use ${token} to sign in.` })
    );
    expect(leaky.data.error).toBe("INVALID");
    expect(leaky.data.message).toContain('"context"');
    expect(leaky.data.message).toContain("access token");
    expect(JSON.stringify(leaky.data)).not.toContain(token);
    expect(await prisma.hubItem.count({ where: { userId: ownerId } })).toBe(2);
  });

  it("routes the inbox by assignee and by capability", async () => {
    const g = await tool(grok, "needt_agent_inbox");
    const ids = g.data.items.map((i: Json) => i.id);
    expect(ids).toEqual([itemA, itemB]);
    expect(g.data.items.every((i: Json) => i.untrusted === true)).toBe(true);
    expect(g.data.suggestedPollSeconds).toBeGreaterThan(0);

    const c = await tool(codex, "needt_agent_inbox");
    expect(c.data.items).toEqual([]);

    // Not eligible: no skill, or assigned elsewhere.
    expect((await tool(codex, "needt_agent_task_claim", { id: itemB })).data.error).toBe(
      "NOT_ELIGIBLE"
    );
    expect((await tool(codex, "needt_agent_task_claim", { id: itemA })).data.error).toBe(
      "NOT_ELIGIBLE"
    );
  });

  it("refuses a second claim while the lease is live and extends it on update", async () => {
    const claimed = await tool(grok, "needt_agent_task_claim", { id: itemB });
    expect(claimed.isError ? JSON.stringify(claimed.data ?? claimed.rpcError) : false).toBe(false);
    expect(claimed.data.item.status).toBe("claimed");
    const firstEnd = new Date(claimed.data.item.leaseExpiresAt).getTime();
    expect(firstEnd).toBeGreaterThan(Date.now() + 25 * 60 * 1000);

    await tool(codex, "needt_agent_register", { skills: ["code", "youtube-upload"] });
    const second = await tool(codex, "needt_agent_task_claim", { id: itemB });
    expect(second.isError).toBe(true);
    expect(second.data.error).toBe("ALREADY_CLAIMED");
    expect(second.data.heldBy.name).toBe("Grok Bot");

    // The holder's inbox still shows it; the other agent's does not.
    expect(
      (await tool(grok, "needt_agent_inbox")).data.items.map((i: Json) => i.id)
    ).toContain(itemB);
    expect(
      (await tool(codex, "needt_agent_inbox")).data.items.map((i: Json) => i.id)
    ).not.toContain(itemB);

    const updated = await tool(grok, "needt_agent_task_update", {
      id: itemB,
      message: "Recording started",
      leaseMinutes: 120,
    });
    expect(updated.isError ? JSON.stringify(updated.data ?? updated.rpcError) : false).toBe(false);
    expect(updated.data.item.status).toBe("in_progress");
    expect(new Date(updated.data.item.leaseExpiresAt).getTime()).toBeGreaterThan(
      firstEnd + 60 * 60 * 1000
    );

    // A stale write is refused.
    const stale = await tool(grok, "needt_agent_task_update", {
      id: itemB,
      message: "late",
      expectedVersion: 1,
    });
    expect(stale.data.error).toBe("STALE");
  });

  it("lets exactly one of two concurrent claims win and handles lease expiry", async () => {
    const made = await tool(
      claude,
      "needt_agent_task_create",
      brief({ title: "Race for the upload", clientRef: "race-1" })
    );
    const id = made.data.item.id as string;
    const [one, two] = await Promise.all([
      tool(grok, "needt_agent_task_claim", { id }),
      tool(codex, "needt_agent_task_claim", { id }),
    ]);
    expect([one.isError, two.isError].filter(Boolean)).toHaveLength(1);
    const loser = one.isError ? one : two;
    expect(loser.data.error).toBe("ALREADY_CLAIMED");
    const winnerIsGrok = !one.isError;
    const [winner, other] = winnerIsGrok ? [grok, codex] : [codex, grok];

    // The lease passes; the holder returns first and carries on.
    await prisma.hubItem.update({
      where: { id },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });
    const back = await tool(winner, "needt_agent_task_update", {
      id,
      message: "Still on it",
    });
    expect(back.isError ? JSON.stringify(back.data ?? back.rpcError) : false).toBe(false);

    // The lease passes again and the other agent takes over.
    await prisma.hubItem.update({
      where: { id },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });
    const takeover = await tool(other, "needt_agent_task_claim", { id });
    expect(takeover.isError ? JSON.stringify(takeover.data ?? takeover.rpcError) : false).toBe(false);
    const lost = await tool(winner, "needt_agent_task_update", {
      id,
      message: "I am back",
    });
    expect(lost.data.error).toBe("LEASE_LOST");

    const log = (await ownerAction(id, "detail")).data.item.events as Json[];
    const types = log.map((e) => e.type);
    expect(types.indexOf("lease_expired")).toBeGreaterThan(-1);
    const expiredAt = types.lastIndexOf("lease_expired");
    expect(types[expiredAt + 1]).toBe("claimed");
    // Every change names who did it.
    expect(log.every((e) => e.actor && e.at)).toBe(true);

    await tool(other, "needt_agent_task_complete", {
      id,
      outcome: "failed",
      result: { summary: "Gave up: not needed any more." },
    });
  });

  it("completes with a structured result the creator can read, and notes are found by other agents", async () => {
    const empty = await tool(grok, "needt_agent_task_complete", {
      id: itemB,
      outcome: "done",
      criteriaMet: true,
      result: { summary: "" },
    });
    expect(empty.isError).toBe(true);

    const done = await tool(grok, "needt_agent_task_complete", {
      id: itemB,
      outcome: "done",
      criteriaMet: true,
      criteriaNote: "Video is public.",
      result: {
        summary: "Recorded and uploaded.",
        links: [{ label: "Demo video", url: "https://youtu.be/abc123" }],
        data: { seconds: 118 },
      },
    });
    expect(done.isError ? JSON.stringify(done.data ?? done.rpcError) : false).toBe(false);
    expect(done.data.item.status).toBe("done");

    const created = await tool(claude, "needt_agent_inbox", { view: "created" });
    const mine = created.data.items.find((i: Json) => i.id === itemB);
    expect(mine.result.links[0].url).toBe("https://youtu.be/abc123");
    expect(mine.result.summary).toBe("Recorded and uploaded.");

    const terminal = await tool(grok, "needt_agent_task_update", {
      id: itemB,
      message: "one more thing",
    });
    expect(terminal.data.error).toBe("TERMINAL");

    const note = await tool(grok, "needt_memory_write", {
      text: "Upload channel is the Needt brand channel, not the personal one.",
      tags: ["YouTube"],
      itemId: itemB,
    });
    expect(note.isError ? JSON.stringify(note.data ?? note.rpcError) : false).toBe(false);
    expect(note.data.note.tags).toEqual(["youtube"]);

    const found = await tool(claude, "needt_memory_search", {
      query: "upload channel",
    });
    expect(found.data.notes).toHaveLength(1);
    expect(found.data.notes[0].author.name).toBe("Grok Bot");
    expect(found.data.notes[0].untrusted).toBe(true);

    const secret = await tool(grok, "needt_memory_write", {
      text: `key ${AWS_KEY} is the one`,
    });
    expect(secret.data.error).toBe("INVALID");
    expect(secret.data.message).not.toContain(AWS_KEY);
  });

  it("escalates to exactly one owner task; only the owner answers or approves", async () => {
    const claimed = await tool(grok, "needt_agent_task_claim", { id: itemA });
    expect(claimed.data.risks).toEqual(["publish"]);
    expect(claimed.data.notice).toContain("escalate");

    const esc = await tool(grok, "needt_agent_task_escalate", {
      id: itemA,
      question: "Which account should publish the video?",
      options: ["Brand channel", "Personal channel"],
      risk: "publish",
    });
    expect(esc.isError ? JSON.stringify(esc.data ?? esc.rpcError) : false).toBe(false);
    expect(esc.data.item.status).toBe("needs_owner");
    expect(esc.data.item.heldBy).toBeNull();

    const tasks = await prisma.task.findMany({
      where: { workspaceId: ownerWorkspace, title: { startsWith: "Decide:" } },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(esc.data.ownerTaskId);
    expect(tasks[0].description).toContain(`/agents?item=${itemA}`);

    // An agent cannot leave needs_owner, and the item is not in any inbox.
    const self = await tool(grok, "needt_agent_task_update", {
      id: itemA,
      status: "in_progress",
      message: "approved myself",
    });
    expect(self.data.error).toBe("NEEDS_OWNER");
    expect(
      (await tool(grok, "needt_agent_inbox")).data.items.map((i: Json) => i.id)
    ).not.toContain(itemA);

    // Ticking the linked Needt task answers nothing.
    await prisma.task.update({
      where: { id: tasks[0].id },
      data: { status: "completed", completedAt: new Date() },
    });
    const still = await prisma.hubItem.findUniqueOrThrow({ where: { id: itemA } });
    expect(still.status).toBe("needs_owner");
    await prisma.task.update({
      where: { id: tasks[0].id },
      data: { status: "todo", completedAt: null },
    });

    // No agent credential, not even the personal token, is an owner.
    for (const token of [grok, claude]) {
      const response = await ownerItemAction(
        new NextRequest(`http://localhost/api/agent-hub/items/${itemA}/approve`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ risks: ["publish"] }),
        }),
        { params: Promise.resolve({ id: itemA, action: "approve" }) }
      );
      expect([401, 403]).toContain(response.status);
    }
    expect((await prisma.hubItem.findUniqueOrThrow({ where: { id: itemA } })).approvals).toEqual({});

    // Owner answers; the item is open again for the same agent, the task done.
    const answered = await ownerAction(itemA, "answer", {
      answer: "Use the brand channel.",
    });
    expect(answered.status).toBe(200);
    expect(answered.data.item.status).toBe("open");
    expect(answered.data.item.assignee.name).toBe("Grok Bot");
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: tasks[0].id } })).status
    ).toBe("completed");
    const inbox = await tool(grok, "needt_agent_inbox");
    const row = inbox.data.items.find((i: Json) => i.id === itemA);
    expect(row.events.some((e: Json) => e.message === "Use the brand channel.")).toBe(
      true
    );

    // Done is refused until every declared risk is approved by the owner.
    await tool(grok, "needt_agent_task_claim", { id: itemA });
    const blocked = await tool(grok, "needt_agent_task_complete", {
      id: itemA,
      outcome: "done",
      criteriaMet: true,
      result: { summary: "Published." },
    });
    expect(blocked.data.error).toBe("APPROVAL_REQUIRED");
    expect(blocked.data.missing).toEqual(["publish"]);

    const approved = await ownerAction(itemA, "approve", {
      risks: ["publish"],
      note: "Go ahead",
    });
    expect(approved.status).toBe(200);
    const ok = await tool(grok, "needt_agent_task_complete", {
      id: itemA,
      outcome: "done",
      criteriaMet: true,
      result: { summary: "Published on the brand channel." },
    });
    expect(ok.isError ? JSON.stringify(ok.data ?? ok.rpcError) : false).toBe(false);
    expect(ok.data.item.status).toBe("done");

    // Approve is disabled for an item with no declared risks.
    const noRisk = await ownerAction(itemB, "approve", { risks: ["money"] });
    expect(noRisk.status).toBe(400);
  });

  it("flags an unmatched any-capable item and raises one owner task after 24 hours", async () => {
    const made = await tool(
      claude,
      "needt_agent_task_create",
      brief({ title: "Needs a screen recorder", requiredSkills: ["holo-camera"] })
    );
    const id = made.data.item.id as string;
    const first = (await overview()).items.find((i: Json) => i.id === id);
    expect(first.noCapableAgent).toBe(true);
    expect(first.noAgentTaskId).toBeNull();

    await prisma.hubItem.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    await overview();
    await overview();
    const second = (await overview()).items.find((i: Json) => i.id === id);
    expect(second.noAgentTaskId).toBeTruthy();
    expect(
      await prisma.task.count({
        where: {
          workspaceId: ownerWorkspace,
          title: { startsWith: "No agent for:" },
        },
      })
    ).toBe(1);
  });

  it("hides finished items after 14 days without deleting them", async () => {
    const old = await prisma.hubItem.create({
      data: {
        userId: ownerId,
        workspaceId: ownerWorkspace,
        title: "Old finished item",
        goal: "x".repeat(25),
        doneCriteria: "done",
        context: "y".repeat(45),
        risks: [],
        status: "done",
        creatorKind: "owner",
        closedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      },
    });
    expect((await overview()).items.map((i: Json) => i.id)).not.toContain(old.id);
    expect((await overview(true)).items.map((i: Json) => i.id)).toContain(old.id);
  });

  it("lets the owner edit notes, and an agent cannot overwrite an edited one", async () => {
    const note = await tool(grok, "needt_memory_write", { text: "Draft fact", tags: ["draft"] });
    const id = note.data.note.id as string;
    const edited = await ownerNotePatch(
      ownerRequest(`/api/agent-hub/notes/${id}`, "PATCH", { text: "Fixed fact" }),
      { params: Promise.resolve({ id }) }
    );
    expect(edited.status).toBe(200);
    expect((await edited.json()).note.ownerEdited).toBe(true);

    const { PATCH } = await import("@/app/api/connect/agent-hub/notes/[id]/route");
    const refused = await PATCH(
      new NextRequest(`http://localhost/api/connect/agent-hub/notes/${id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${grok}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ text: "Agent rewrite" }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(refused.status).toBe(403);
    expect(
      (await prisma.hubNote.findUniqueOrThrow({ where: { id } })).text
    ).toBe("Fixed fact");
  });

  it("shows the token once, then only a preview, and a revoked token stops working", async () => {
    const response = await agentsPost(
      ownerRequest("/api/agent-hub/agents", "POST", { name: "Cloud routine", kind: "routine" })
    );
    expect(response.status).toBe(201);
    const made = (await response.json()) as Json;
    expect(made.token).toMatch(/^needt_agent_/);
    const stored = await prisma.hubAgentToken.findFirstOrThrow({
      where: { agentId: made.agent.id },
    });
    expect(stored.tokenHash).not.toContain(made.token);
    expect(stored.scopes).toEqual(["agents.hub"]);

    const listed = await overview();
    const row = listed.agents.find((a: Json) => a.id === made.agent.id);
    expect(row.token.preview).toBe(stored.tokenPreview);
    expect(JSON.stringify(listed)).not.toContain(made.token);

    expect((await tool(made.token, "needt_agents_list")).isError).toBe(false);
    const revoked = await agentDelete(
      ownerRequest(`/api/agent-hub/agents/${made.agent.id}`, "DELETE"),
      { params: Promise.resolve({ id: made.agent.id }) }
    );
    expect(revoked.status).toBe(200);
    const after = await rpc(made.token, "tools/list");
    expect(after.status).toBe(401);
  });
});
