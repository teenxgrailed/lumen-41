/**
 * The whole agent hub loop against a real database, through the MCP route and
 * the owner route handlers: register → create (assigned and "any capable") →
 * inbox by capability → claim (a live lease refuses a second claim) → update
 * extends the lease → complete with a result → memory search finds it;
 * escalate → an owner alert (unread badge, no Needt task); owner approve and
 * answer; a connection without the flag sees no hub tools. Runs with AGENT_HUB_INTEGRATION=1 (CI
 * sets it next to Postgres).
 */
import { NextRequest } from "next/server";

import { DELETE as agentDelete } from "@/app/api/agent-hub/agents/[id]/route";
import { POST as agentsPost } from "@/app/api/agent-hub/agents/route";
import { GET as badgeGet } from "@/app/api/agent-hub/badge/route";
import { POST as ownerItemAction } from "@/app/api/agent-hub/items/[id]/[action]/route";
import { PATCH as ownerNotePatch } from "@/app/api/agent-hub/notes/[id]/route";
import { GET as overviewGet } from "@/app/api/agent-hub/overview/route";
import { GET as restInboxGet } from "@/app/api/connect/agent-hub/inbox/route";
import { GET as restNextGet } from "@/app/api/connect/agent-hub/next/route";
import { POST as mcpPost } from "@/app/api/mcp/route";
import {
  generateConnectorToken,
  hashConnectorToken,
} from "@/services/connectors/auth-tokens";
import { WorkspaceKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { closeRedisConnection } from "@/lib/queue/connection";

import { ownerUpdateAgent } from "../agents";
import { agentForConnection, assistantAgentScope } from "../context";
import { HubError } from "../errors";
import { createItem, listItems } from "../items";
import { writeNote } from "../notes";
import { createAgentToken, revokeAgentToken } from "../tokens";

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
// A Free person for the plan-limit cases; the owner above is on Pro so the
// rest of this file is not limited.
const freeId = `${run}-free`;
const freeWorkspace = `${run}-ws3`;
const freeWorkspaceTwo = `${run}-ws4`;

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

async function badge(): Promise<{ enabled: boolean; unread: number }> {
  const response = await badgeGet(ownerRequest("/api/agent-hub/badge", "GET"));
  return (await response.json()) as { enabled: boolean; unread: number };
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
      [freeId, freeWorkspace],
    ] as const) {
      await prisma.user.create({
        data: { id, email: `${id}@example.test`, emailVerified: new Date() },
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
    // Production opens the hub to everyone (migration agent_hub_for_everyone);
    // these tests pin the flag off so the gate itself stays covered, and let
    // only the owner in.
    await prisma.featureFlag.upsert({
      where: { key: "agent_hub" },
      update: { enabled: false, rolloutPercentage: 0 },
      create: { key: "agent_hub", enabled: false, rolloutPercentage: 0 },
    });
    await prisma.featureFlagOverride.create({
      data: { flagKey: "agent_hub", userId: ownerId, enabled: true },
    });
    await prisma.featureFlagOverride.create({
      data: { flagKey: "agent_hub", userId: freeId, enabled: true },
    });
    // Free keeps 2 agents and 30 open items; the general cases below create
    // more than that, so the owner is on Pro.
    await prisma.subscription.create({
      data: {
        userId: ownerId,
        plan: "PRO",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2999-01-01"),
      },
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
      where: {
        workspaceId: { in: [ownerWorkspace, otherWorkspace, freeWorkspace] },
      },
    });
    await prisma.workspace.deleteMany({
      where: { id: { in: [ownerWorkspace, otherWorkspace, freeWorkspace] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherId, freeId] } },
    });
    // Hub writes publish realtime events over the shared Redis connection;
    // left open it keeps Jest alive after the run.
    await closeRedisConnection();
    await prisma.$disconnect();
  });

  it("shows the twenty-two hub tools to the flagged owner and none to anyone else", async () => {
    for (const token of [claude, grok, codex]) {
      const { body } = await rpc(token, "tools/list");
      const names: string[] = body.result.tools.map(
        (t: { name: string }) => t.name
      );
      expect(
        names.filter((n) => /^needt_(agent|agents|memory)_/.test(n))
      ).toHaveLength(22);
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
    await tool(codex, "needt_agent_register", {
      kind: "codex",
      skills: ["code"],
    });

    const list = await tool(grok, "needt_agents_list");
    const rows: Json[] = list.data.agents;
    expect(rows.filter((r) => r.self)).toHaveLength(1);
    expect(rows.find((r) => r.self).name).toBe("Grok Bot");
    expect(JSON.stringify(list.data)).not.toMatch(/tokenHash|needt_agent_/);

    // Another agent's profile is refused.
    const other = await tool(codex, "needt_agent_register", {
      agentId: grokId,
    });
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
    expect(a.isError ? JSON.stringify(a.data ?? a.rpcError) : false).toBe(
      false
    );
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
    expect(b.isError ? JSON.stringify(b.data ?? b.rpcError) : false).toBe(
      false
    );
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
    expect(
      (await tool(codex, "needt_agent_task_claim", { id: itemB })).data.error
    ).toBe("NOT_ELIGIBLE");
    expect(
      (await tool(codex, "needt_agent_task_claim", { id: itemA })).data.error
    ).toBe("NOT_ELIGIBLE");
  });

  it("refuses a second claim while the lease is live and extends it on update", async () => {
    const claimed = await tool(grok, "needt_agent_task_claim", { id: itemB });
    expect(
      claimed.isError ? JSON.stringify(claimed.data ?? claimed.rpcError) : false
    ).toBe(false);
    expect(claimed.data.item.status).toBe("claimed");
    const firstEnd = new Date(claimed.data.item.leaseExpiresAt).getTime();
    expect(firstEnd).toBeGreaterThan(Date.now() + 25 * 60 * 1000);

    await tool(codex, "needt_agent_register", {
      skills: ["code", "youtube-upload"],
    });
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
    expect(
      updated.isError ? JSON.stringify(updated.data ?? updated.rpcError) : false
    ).toBe(false);
    expect(updated.data.item.status).toBe("in_progress");
    expect(
      new Date(updated.data.item.leaseExpiresAt).getTime()
    ).toBeGreaterThan(firstEnd + 60 * 60 * 1000);

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
    expect(
      back.isError ? JSON.stringify(back.data ?? back.rpcError) : false
    ).toBe(false);

    // The lease passes again and the other agent takes over.
    await prisma.hubItem.update({
      where: { id },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });
    const takeover = await tool(other, "needt_agent_task_claim", { id });
    expect(
      takeover.isError
        ? JSON.stringify(takeover.data ?? takeover.rpcError)
        : false
    ).toBe(false);
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
    expect(
      done.isError ? JSON.stringify(done.data ?? done.rpcError) : false
    ).toBe(false);
    expect(done.data.item.status).toBe("done");

    const created = await tool(claude, "needt_agent_inbox", {
      view: "created",
    });
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
    expect(
      note.isError ? JSON.stringify(note.data ?? note.rpcError) : false
    ).toBe(false);
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

  it("escalates with an owner alert and no Needt task; only the owner answers or approves", async () => {
    const claimed = await tool(grok, "needt_agent_task_claim", { id: itemA });
    expect(claimed.data.risks).toEqual(["publish"]);
    expect(claimed.data.notice).toContain("escalate");

    const unreadBefore = (await badge()).unread;
    const esc = await tool(grok, "needt_agent_task_escalate", {
      id: itemA,
      question: "Which account should publish the video?",
      options: ["Brand channel", "Personal channel"],
      risk: "publish",
    });
    expect(esc.isError ? JSON.stringify(esc.data ?? esc.rpcError) : false).toBe(
      false
    );
    expect(esc.data.item.status).toBe("needs_owner");
    expect(esc.data.item.heldBy).toBeNull();

    // The hub is separate from the person's tasks: no Needt task, an unread
    // alert (the badge on Agents) instead.
    expect(
      await prisma.task.count({
        where: {
          workspaceId: ownerWorkspace,
          title: { startsWith: "Decide:" },
        },
      })
    ).toBe(0);
    expect(esc.data.ownerTaskId).toBeUndefined();
    expect(esc.data.item.ownerUnread).toBe(true);
    expect((await badge()).unread).toBe(unreadBefore + 1);
    // Opening the item reads the alert; nothing else about it changes.
    expect((await ownerAction(itemA, "seen")).data.seen).toBe(true);
    expect((await badge()).unread).toBe(unreadBefore);
    expect((await ownerAction(itemA, "seen")).data.seen).toBe(false);

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

    // No agent credential, not even the personal token, is an owner.
    for (const token of [grok, claude]) {
      const response = await ownerItemAction(
        new NextRequest(
          `http://localhost/api/agent-hub/items/${itemA}/approve`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ risks: ["publish"] }),
          }
        ),
        { params: Promise.resolve({ id: itemA, action: "approve" }) }
      );
      expect([401, 403]).toContain(response.status);
    }
    expect(
      (await prisma.hubItem.findUniqueOrThrow({ where: { id: itemA } }))
        .approvals
    ).toEqual({});

    // Owner answers; the item is open again for the same agent.
    const answered = await ownerAction(itemA, "answer", {
      answer: "Use the brand channel.",
    });
    expect(answered.status).toBe(200);
    expect(answered.data.item.status).toBe("open");
    expect(answered.data.item.assignee.name).toBe("Grok Bot");
    const inbox = await tool(grok, "needt_agent_inbox");
    const row = inbox.data.items.find((i: Json) => i.id === itemA);
    expect(
      row.events.some((e: Json) => e.message === "Use the brand channel.")
    ).toBe(true);

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
    expect(ok.isError ? JSON.stringify(ok.data ?? ok.rpcError) : false).toBe(
      false
    );
    expect(ok.data.item.status).toBe("done");

    // Approve is disabled for an item with no declared risks.
    const noRisk = await ownerAction(itemB, "approve", { risks: ["money"] });
    expect(noRisk.status).toBe(400);
  });

  it("flags an unmatched any-capable item and raises one owner alert (no task) after 24 hours", async () => {
    const made = await tool(
      claude,
      "needt_agent_task_create",
      brief({
        title: "Needs a screen recorder",
        requiredSkills: ["holo-camera"],
      })
    );
    const id = made.data.item.id as string;
    const first = (await overview()).items.find((i: Json) => i.id === id);
    expect(first.noCapableAgent).toBe(true);
    expect(first.ownerUnread).toBe(false);
    const unreadBefore = (await badge()).unread;

    await prisma.hubItem.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    await overview();
    await overview();
    const second = (await overview()).items.find((i: Json) => i.id === id);
    expect(second.ownerUnread).toBe(true);
    expect(
      (await prisma.hubItem.findUniqueOrThrow({ where: { id } }))
        .noAgentAlertedAt
    ).toBeTruthy();
    // Exactly one alert, however many readers swept, and no Needt task.
    expect(
      await prisma.hubItemEvent.count({
        where: { itemId: id, type: "no_capable_agent" },
      })
    ).toBe(1);
    expect((await badge()).unread).toBe(unreadBefore + 1);
    expect(
      await prisma.task.count({
        where: {
          workspaceId: ownerWorkspace,
          title: { startsWith: "No agent for:" },
        },
      })
    ).toBe(0);
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
    expect((await overview()).items.map((i: Json) => i.id)).not.toContain(
      old.id
    );
    expect((await overview(true)).items.map((i: Json) => i.id)).toContain(
      old.id
    );
  });

  it("lets the owner edit notes, and an agent cannot overwrite an edited one", async () => {
    const note = await tool(grok, "needt_memory_write", {
      text: "Draft fact",
      tags: ["draft"],
    });
    const id = note.data.note.id as string;
    const edited = await ownerNotePatch(
      ownerRequest(`/api/agent-hub/notes/${id}`, "PATCH", {
        text: "Fixed fact",
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(edited.status).toBe(200);
    expect((await edited.json()).note.ownerEdited).toBe(true);

    const { PATCH } = await import(
      "@/app/api/connect/agent-hub/notes/[id]/route"
    );
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
      ownerRequest("/api/agent-hub/agents", "POST", {
        name: "Cloud routine",
        kind: "routine",
      })
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

  it("keeps the assignee on escalation and lets only the assignee (or the creator of an unassigned item) escalate an open item", async () => {
    const codexAgent = await prisma.hubAgent.findFirstOrThrow({
      where: { userId: ownerId, name: "Codex" },
    });
    const made = await tool(
      grok,
      "needt_agent_task_create",
      brief({
        title: "Fix the sync",
        assignee: "Codex",
        requiredSkills: undefined,
      })
    );
    expect(
      made.isError ? JSON.stringify(made.data ?? made.rpcError) : false
    ).toBe(false);
    const id = made.data.item.id as string;

    // The creator cannot take an assigned item over by escalating it.
    const stolen = await tool(grok, "needt_agent_task_escalate", {
      id,
      question: "Which branch should this go to?",
    });
    expect(stolen.data.error).toBe("NOT_HELD");
    expect(
      (await prisma.hubItem.findUniqueOrThrow({ where: { id } })).status
    ).toBe("open");

    const ok = await tool(codex, "needt_agent_task_escalate", {
      id,
      question: "Which branch should this go to?",
    });
    expect(ok.data.item.status).toBe("needs_owner");
    const row = await prisma.hubItem.findUniqueOrThrow({ where: { id } });
    expect(row.assigneeAgentId).toBe(codexAgent.id);

    // An unassigned item: its creator may escalate, and it stays unassigned.
    const open = await tool(
      grok,
      "needt_agent_task_create",
      brief({ title: "Anyone with code", requiredSkills: ["code"] })
    );
    const openId = open.data.item.id as string;
    const byCreator = await tool(grok, "needt_agent_task_escalate", {
      id: openId,
      question: "Is this still wanted?",
    });
    expect(byCreator.data.item.status).toBe("needs_owner");
    expect(
      (await prisma.hubItem.findUniqueOrThrow({ where: { id: openId } }))
        .assigneeAgentId
    ).toBeNull();
  });

  it("clears the alert when a needs_owner item is cancelled, and touches no task", async () => {
    const made = await tool(
      grok,
      "needt_agent_task_create",
      brief({
        title: "Cancel while waiting",
        assignee: "Grok Bot",
        requiredSkills: undefined,
      })
    );
    const id = made.data.item.id as string;
    const unreadBefore = (await badge()).unread;
    const esc = await tool(grok, "needt_agent_task_escalate", {
      id,
      question: "Proceed?",
    });
    expect(esc.data.ownerTaskId).toBeUndefined();
    expect((await badge()).unread).toBe(unreadBefore + 1);

    const cancelled = await ownerAction(id, "cancel", {
      reason: "No longer needed",
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.item.status).toBe("cancelled");
    expect((await badge()).unread).toBe(unreadBefore);
    expect(
      await prisma.task.count({
        where: {
          workspaceId: ownerWorkspace,
          title: { startsWith: "Decide:" },
        },
      })
    ).toBe(0);
  });

  it("links only the owner's own tasks", async () => {
    const mine = await prisma.task.create({
      data: {
        title: "Mine",
        status: "todo",
        userId: ownerId,
        workspaceId: ownerWorkspace,
      },
    });
    // A shared-workspace member's task: same workspace, someone else's.
    const theirs = await prisma.task.create({
      data: {
        title: "Theirs",
        status: "todo",
        userId: otherId,
        workspaceId: ownerWorkspace,
      },
    });
    const ok = await tool(
      claude,
      "needt_agent_task_create",
      brief({ title: "Link mine", links: [{ type: "task", id: mine.id }] })
    );
    expect(ok.isError ? JSON.stringify(ok.data ?? ok.rpcError) : false).toBe(
      false
    );
    const refused = await tool(
      claude,
      "needt_agent_task_create",
      brief({ title: "Link theirs", links: [{ type: "task", id: theirs.id }] })
    );
    expect(refused.data.error).toBe("INVALID");
  });

  // -------------------------------------------------------------------------
  // The graph: links, ready queue, plans, next, checklist, stale, usage
  // -------------------------------------------------------------------------

  const lane = (extra: Record<string, unknown> = {}) =>
    brief({ requiredSkills: ["graph-lane"], ...extra });

  async function makeItem(extra: Record<string, unknown> = {}) {
    const made = await tool(claude, "needt_agent_task_create", lane(extra));
    expect(
      made.isError ? JSON.stringify(made.data ?? made.rpcError) : false
    ).toBe(false);
    return made.data.item.id as string;
  }

  async function link(fromId: string, toId: string, kind: string) {
    return tool(claude, "needt_agent_task_link", { fromId, toId, kind });
  }

  async function readItem(id: string) {
    const read = await tool(claude, "needt_agent_inbox", { itemId: id });
    return read.data.item as Json;
  }

  async function finish(token: string, id: string, extra = {}) {
    await tool(token, "needt_agent_task_claim", { id });
    return tool(token, "needt_agent_task_complete", {
      id,
      outcome: "done",
      result: { summary: "Done." },
      criteriaMet: true,
      ...extra,
    });
  }

  it("links items, refuses loops and other agents' items, and shows links in the views", async () => {
    await tool(grok, "needt_agent_register", {
      skills: ["browser", "youtube-upload", "screen-recording", "graph-lane"],
    });
    await tool(codex, "needt_agent_register", {
      skills: ["code", "youtube-upload", "graph-lane"],
    });
    const a = await makeItem({ title: "Link A" });
    const b = await makeItem({ title: "Link B" });
    const c = await makeItem({ title: "Link C" });

    const first = await link(a, b, "blocks");
    expect(first.data.linked).toBe(true);
    expect((await link(a, b, "blocks")).data.linked).toBe(false);

    // Direct and transitive loops are refused, and so is a link to itself.
    expect((await link(b, a, "blocks")).data.error).toBe("CYCLE");
    expect((await link(b, c, "blocks")).data.linked).toBe(true);
    expect((await link(c, a, "blocks")).data.error).toBe("CYCLE");
    expect((await link(a, a, "relates")).data.error).toBe("INVALID");
    // The same pair may carry different kinds: parent is its own graph.
    expect((await link(b, a, "parent")).data.linked).toBe(true);
    expect((await link(a, b, "parent")).data.error).toBe("CYCLE");

    // Information kinds do not block; relates reads the same both ways.
    expect((await link(a, c, "relates")).data.linked).toBe(true);
    expect((await link(c, a, "relates")).data.linked).toBe(false);
    expect((await link(c, a, "duplicates")).data.linked).toBe(true);
    expect((await link(a, c, "supersedes")).data.linked).toBe(true);

    // Another agent sees the items but did not create the blocked one.
    const foreign = await tool(grok, "needt_agent_task_link", {
      fromId: a,
      toId: c,
      kind: "blocks",
    });
    expect(foreign.data.error).toBe("FORBIDDEN");

    // An item in another workspace is not found.
    const theirs = await prisma.hubItem.create({
      data: {
        userId: otherId,
        workspaceId: otherWorkspace,
        title: "Theirs",
        goal: "g",
        doneCriteria: "d",
        context: "c",
        risks: [],
        creatorKind: "owner",
      },
    });
    expect((await link(a, theirs.id, "relates")).data.error).toBe("NOT_FOUND");

    const viewB = await readItem(b);
    expect(viewB.blockedBy).toEqual([a]);
    expect(viewB.ready).toBe(false);
    expect(
      viewB.relations.map((r: Json) => `${r.kind}:${r.direction}:${r.item.id}`)
    ).toEqual(
      expect.arrayContaining([
        `blocks:in:${a}`,
        `blocks:out:${c}`,
        `parent:out:${a}`,
      ])
    );
    expect(viewB.events.map((e: Json) => e.type)).toContain("linked");

    // Unlink, and an unknown link is not found.
    expect(
      (
        await tool(claude, "needt_agent_task_unlink", {
          fromId: a,
          toId: c,
          kind: "supersedes",
        })
      ).data.unlinked
    ).toBe(true);
    expect(
      (
        await tool(claude, "needt_agent_task_unlink", {
          fromId: a,
          toId: c,
          kind: "supersedes",
        })
      ).data.error
    ).toBe("NOT_FOUND");
    // With the loop link gone the reverse direction is allowed again.
    await tool(claude, "needt_agent_task_unlink", {
      fromId: b,
      toId: c,
      kind: "blocks",
    });
    expect((await link(c, a, "blocks")).data.linked).toBe(true);

    // The owner links through the REST route; an agent token cannot.
    const viaOwner = await ownerAction(a, "link", { toId: c, kind: "relates" });
    expect(viaOwner.status).toBe(200);

    // Clean up so the capable-item test below sees only its own items.
    for (const id of [a, b, c]) await ownerAction(id, "cancel");
  });

  it("offers only ready items, refuses to claim a blocked one and unblocks when the blocker is done or cancelled", async () => {
    const first = await makeItem({ title: "Ready first" });
    const second = await makeItem({ title: "Ready second" });
    const third = await makeItem({ title: "Ready third" });
    const fourth = await makeItem({ title: "Ready fourth" });
    await link(first, second, "blocks");
    await link(third, fourth, "blocks");

    const ready = await tool(grok, "needt_agent_inbox", {
      view: "ready",
      limit: 25,
    });
    const readyIds = ready.data.items.map((i: Json) => i.id);
    expect(readyIds).toEqual(expect.arrayContaining([first, third]));
    expect(readyIds).not.toContain(second);
    expect(readyIds).not.toContain(fourth);
    const inbox = await tool(grok, "needt_agent_inbox", { limit: 25 });
    const inboxIds = inbox.data.items.map((i: Json) => i.id);
    expect(inboxIds).toContain(first);
    expect(inboxIds).not.toContain(second);

    const refused = await tool(grok, "needt_agent_task_claim", { id: second });
    expect(refused.isError).toBe(true);
    expect(refused.data.error).toBe("BLOCKED_BY");
    expect(refused.data.blockedBy).toEqual([first]);

    // Done unblocks, with an event on the dependent and no owner alert.
    const unreadBefore = (await badge()).unread;
    expect((await finish(grok, first)).isError).toBe(false);
    const afterDone = await readItem(second);
    expect(afterDone.blockedBy).toEqual([]);
    expect(afterDone.ready).toBe(true);
    expect(afterDone.events.map((e: Json) => e.type)).toContain("unblocked");
    expect((await badge()).unread).toBe(unreadBefore);
    expect(
      (await tool(grok, "needt_agent_task_claim", { id: second })).isError
    ).toBe(false);

    // Cancelled also unblocks.
    expect((await ownerAction(third, "cancel")).status).toBe(200);
    expect((await readItem(fourth)).ready).toBe(true);

    // A failed blocker keeps its dependent waiting.
    const broken = await makeItem({ title: "Will fail" });
    const waiting = await makeItem({ title: "Waits for the failure" });
    await link(broken, waiting, "blocks");
    await tool(grok, "needt_agent_task_claim", { id: broken });
    await tool(grok, "needt_agent_task_complete", {
      id: broken,
      outcome: "failed",
      result: { summary: "It broke." },
    });
    const stillBlocked = await tool(codex, "needt_agent_task_claim", {
      id: waiting,
    });
    expect(stillBlocked.data.error).toBe("BLOCKED_BY");
    // Removing the link frees it.
    await tool(claude, "needt_agent_task_unlink", {
      fromId: broken,
      toId: waiting,
      kind: "blocks",
    });
    expect((await readItem(waiting)).ready).toBe(true);

    for (const id of [second, fourth, waiting]) {
      await ownerAction(id, "cancel");
    }
  });

  it("creates a plan in one call, checks every step first and is repeat-safe", async () => {
    const step = (title: string, extra: Record<string, unknown> = {}) =>
      lane({ title, ...extra });
    const countPlans = () =>
      prisma.hubItem.count({
        where: { userId: ownerId, title: { startsWith: "Plan " } },
      });

    const before = await countPlans();
    const bad = await tool(claude, "needt_agent_plan_create", {
      ...lane({ title: "Plan broken" }),
      sequential: true,
      children: [
        step("Plan step ok"),
        step("Plan step thin", { context: "short" }),
      ],
    });
    expect(bad.isError).toBe(true);
    expect(bad.data.message).toContain("children[1]");
    expect(await countPlans()).toBe(before);

    const made = await tool(claude, "needt_agent_plan_create", {
      ...lane({ title: "Plan ship", clientRef: "plan-ship" }),
      sequential: true,
      children: [
        step("Plan one", { assignee: "Codex", requiredSkills: undefined }),
        step("Plan two"),
        step("Plan three"),
      ],
    });
    expect(made.isError ? JSON.stringify(made.data) : false).toBe(false);
    expect(made.data.created).toBe(true);
    const [one, two, three] = made.data.plan.steps as Json[];
    expect(made.data.plan.steps.map((s: Json) => s.title)).toEqual([
      "Plan one",
      "Plan two",
      "Plan three",
    ]);
    expect(one.ready).toBe(true);
    expect(two.blockedBy).toEqual([one.id]);
    expect(three.blockedBy).toEqual([two.id]);
    // The parent is the wrap-up: it waits for every step.
    expect(made.data.plan.item.ready).toBe(false);
    expect(made.data.plan.item.blockedBy).toHaveLength(3);
    expect(
      made.data.plan.item.relations.filter((r: Json) => r.kind === "parent")
    ).toHaveLength(3);

    const again = await tool(claude, "needt_agent_plan_create", {
      ...lane({ title: "Plan ship", clientRef: "plan-ship" }),
      children: [step("Plan one")],
    });
    expect(again.data.created).toBe(false);
    expect(again.data.plan.item.id).toBe(made.data.plan.item.id);
    expect(again.data.plan.steps).toHaveLength(3);

    // Running the plan: each step opens the next, then the parent.
    expect((await finish(codex, one.id)).isError).toBe(false);
    expect((await readItem(two.id)).ready).toBe(true);
    expect((await readItem(three.id)).ready).toBe(false);
    expect((await finish(codex, two.id)).isError).toBe(false);
    expect((await finish(grok, three.id)).isError).toBe(false);
    expect((await readItem(made.data.plan.item.id)).ready).toBe(true);
    expect((await finish(grok, made.data.plan.item.id)).isError).toBe(false);
  });

  it("returns the single best next item: assigned first, then skill match, due date, age", async () => {
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const later = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const open = await makeItem({ title: "Next open any" });
    const dueSoon = await makeItem({ title: "Next due soon", due: soon });
    const assigned = await makeItem({
      title: "Next assigned",
      assignee: "Codex",
      due: later,
    });
    const blocked = await makeItem({ title: "Next blocked", due: soon });
    await link(open, blocked, "blocks");

    const pick = await tool(codex, "needt_agent_next");
    expect(pick.data.item.id).toBe(assigned);
    expect(pick.data.untrusted).toBe(true);

    const skipped = await tool(codex, "needt_agent_next", {
      skipIds: [assigned],
    });
    expect(skipped.data.item.id).toBe(dueSoon);

    // Holding something is reported, and a blocked item is never the pick.
    await tool(codex, "needt_agent_task_claim", { id: assigned });
    const resumed = await tool(codex, "needt_agent_next", {
      skipIds: [dueSoon],
    });
    expect(resumed.data.holding.map((h: Json) => h.id)).toContain(assigned);
    expect(resumed.data.item.id).not.toBe(blocked);

    // Nothing for an agent without the skill.
    await tool(codex, "needt_agent_register", { skills: [] });
    const none = await tool(codex, "needt_agent_next");
    expect(none.data.item).toBeNull();
    await tool(codex, "needt_agent_register", {
      skills: ["code", "youtube-upload", "graph-lane"],
    });

    // REST parity.
    const rest = await restNextGet(
      new NextRequest("http://localhost/api/connect/agent-hub/next", {
        headers: { authorization: `Bearer ${grok}` },
      })
    );
    expect(rest.status).toBe(200);

    for (const id of [open, dueSoon, assigned, blocked]) {
      await ownerAction(id, "cancel");
    }
  });

  it("answers a checklist item by item and keeps the sentence form working", async () => {
    const id = await makeItem({
      title: "Checklist",
      doneCriteria: ["Video uploaded", "Link is public", "Title matches"],
    });
    const created = await readItem(id);
    expect(created.doneCriteria).toBe(
      "- Video uploaded\n- Link is public\n- Title matches"
    );
    expect(created.criteria.map((c: Json) => c.met)).toEqual([
      null,
      null,
      null,
    ]);

    await tool(grok, "needt_agent_task_claim", { id });
    const complete = (criteriaMet: unknown) =>
      tool(grok, "needt_agent_task_complete", {
        id,
        outcome: "done",
        result: { summary: "Uploaded." },
        criteriaMet,
      });
    // One boolean, or the wrong number of answers, is refused with the list.
    const single = await complete(true);
    expect(single.data.error).toBe("INVALID");
    expect(single.data.checklist).toHaveLength(3);
    expect((await complete([true, true])).data.error).toBe("INVALID");

    const ok = await complete([true, true, false]);
    expect(ok.isError ? JSON.stringify(ok.data) : false).toBe(false);
    expect(ok.data.item.criteria.map((c: Json) => c.met)).toEqual([
      true,
      true,
      false,
    ]);
    expect(ok.data.item.criteriaNotMet).toBe(true);

    // A plain item takes a boolean and refuses a list.
    const plain = await makeItem({ title: "Plain criteria" });
    await tool(grok, "needt_agent_task_claim", { id: plain });
    const listed = await tool(grok, "needt_agent_task_complete", {
      id: plain,
      outcome: "done",
      result: { summary: "Done." },
      criteriaMet: [true],
    });
    expect(listed.data.error).toBe("INVALID");
    const bool = await tool(grok, "needt_agent_task_complete", {
      id: plain,
      outcome: "done",
      result: { summary: "Done." },
      criteriaMet: true,
    });
    expect(bool.isError).toBe(false);
  });

  it("flags a held item with no update for four hours, and stores usage", async () => {
    const id = await makeItem({ title: "Slow job" });
    await tool(grok, "needt_agent_task_claim", { id });
    const update = await tool(grok, "needt_agent_task_update", {
      id,
      message: "Working",
      usage: { tokens: 12400, costUsd: 0.42, minutes: 18 },
    });
    expect(update.data.item.usage).toEqual({
      tokens: 12400,
      costUsd: 0.42,
      minutes: 18,
    });
    expect(update.data.item.stale).toBe(false);

    // Usage alone is a valid update.
    const usageOnly = await tool(grok, "needt_agent_task_update", {
      id,
      usage: { minutes: 25 },
    });
    expect(usageOnly.isError).toBe(false);
    expect(usageOnly.data.item.usage).toMatchObject({
      tokens: 12400,
      minutes: 25,
    });

    await prisma.hubItem.update({
      where: { id },
      data: { updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    });
    expect((await readItem(id)).stale).toBe(true);
    const listed = (await overview()).items.find((i: Json) => i.id === id);
    expect(listed.stale).toBe(true);

    // Any update clears it; completing reports final usage and ends it.
    const fresh = await tool(grok, "needt_agent_task_update", {
      id,
      heartbeat: true,
    });
    expect(fresh.data.item.stale).toBe(false);
    const done = await tool(grok, "needt_agent_task_complete", {
      id,
      outcome: "done",
      result: { summary: "Finished." },
      criteriaMet: true,
      usage: { tokens: 20000, costUsd: 0.7, minutes: 31 },
    });
    expect(done.data.item.usage).toEqual({
      tokens: 20000,
      costUsd: 0.7,
      minutes: 31,
    });
    expect(done.data.item.stale).toBe(false);
  });

  it("finds a capable item even when more than 100 items the agent cannot do come first", async () => {
    const early = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const common = {
      userId: ownerId,
      workspaceId: ownerWorkspace,
      title: "Bulk",
      goal: "g",
      doneCriteria: "d",
      context: "c",
      risks: [],
      creatorKind: "owner",
      status: "open",
    };
    await prisma.hubItem.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        ...common,
        title: `Cannot do ${i}`,
        requiredSkills: ["holo-camera"],
        createdAt: early,
      })),
    });
    const wanted = await prisma.hubItem.create({
      data: { ...common, title: "Can do", requiredSkills: ["code"] },
    });
    const inbox = await tool(codex, "needt_agent_inbox", { limit: 25 });
    const ids = inbox.data.items.map((i: Json) => i.id);
    expect(ids).toContain(wanted.id);
    expect(
      inbox.data.items.every((i: Json) => !i.title.startsWith("Cannot do"))
    ).toBe(true);
  });
  describe("Free plan limits against real rows", () => {
    const freeOwner = {
      userId: freeId,
      workspaceId: freeWorkspace,
      actor: { kind: "owner" as const },
    };
    const freeKey = { userId: freeId, workspaceId: freeWorkspace };
    const personalAuth = (id: string) => ({
      userId: freeId,
      kind: "personal" as const,
      scopes: ["needt.read" as const, "needt.write" as const],
      personalTokenId: id,
      personalTokenName: id,
    });
    const code = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        return error instanceof HubError ? error.code : String(error);
      }
      return null;
    };

    beforeEach(async () => {
      await prisma.hubNote.deleteMany({ where: { userId: freeId } });
      await prisma.hubItem.deleteMany({ where: { userId: freeId } });
      await prisma.hubAgent.deleteMany({ where: { userId: freeId } });
    });

    it("frees the slot of a revoked token, and re-enabling is gated (M1, M2)", async () => {
      const a = await createAgentToken(freeOwner, { name: "A" });
      await createAgentToken(freeOwner, { name: "B" });
      expect(await code(() => createAgentToken(freeOwner, { name: "C" }))).toBe(
        "PLAN_LIMIT"
      );

      await revokeAgentToken(freeOwner, a.agent.id);
      const revoked = await prisma.hubAgent.findUniqueOrThrow({
        where: { id: a.agent.id },
      });
      expect(revoked.disabledAt).not.toBeNull();
      await createAgentToken(freeOwner, { name: "C" });

      // B and C are active, so bringing A back would be the 3rd.
      expect(
        await code(() =>
          ownerUpdateAgent(freeOwner, a.agent.id, { disabled: false })
        )
      ).toBe("PLAN_LIMIT");
      const still = await prisma.hubAgent.findUniqueOrThrow({
        where: { id: a.agent.id },
      });
      expect(still.disabledAt).not.toBeNull();
    });

    it("counts one connection in two workspaces as one agent (M4)", async () => {
      const auth = personalAuth("tok-two-ws");
      await agentForConnection(auth, freeWorkspace);
      await agentForConnection(auth, freeWorkspaceTwo);
      expect(await prisma.hubAgent.count({ where: { userId: freeId } })).toBe(
        2
      );
      // Two rows, one agent: one slot is still free.
      await createAgentToken(freeOwner, { name: "Second" });
      expect(
        await code(() => createAgentToken(freeOwner, { name: "Third" }))
      ).toBe("PLAN_LIMIT");
    });

    it("counts only open items, and the assistant is never blocked (M5)", async () => {
      const row = {
        userId: freeId,
        workspaceId: freeWorkspace,
        title: "Bulk",
        goal: "g",
        doneCriteria: "d",
        context: "c",
        risks: [],
        creatorKind: "owner",
      };
      await prisma.hubItem.createMany({
        data: [
          ...Array.from({ length: 30 }, () => ({ ...row, status: "open" })),
          ...Array.from({ length: 5 }, () => ({ ...row, status: "done" })),
        ],
      });
      const refused = await prisma.hubItem.count({ where: { userId: freeId } });
      expect(refused).toBe(35);
      expect(await code(() => createItem(freeOwner, brief()))).toBe(
        "PLAN_LIMIT"
      );
      const assistant = await assistantAgentScope(freeKey);
      const made = await createItem(assistant, brief());
      expect(made.created).toBe(true);
    });

    it("counts notes per person, and the assistant can still write one (M5)", async () => {
      await prisma.hubNote.createMany({
        data: Array.from({ length: 100 }, (_, i) => ({
          userId: freeId,
          workspaceId: freeWorkspace,
          text: `note ${i}`,
          tags: [],
          authorKind: "owner",
        })),
      });
      expect(await code(() => writeNote(freeOwner, { text: "one more" }))).toBe(
        "PLAN_LIMIT"
      );
      const assistant = await assistantAgentScope(freeKey);
      await writeNote(assistant, { text: "one more" });
      expect(await prisma.hubNote.count({ where: { userId: freeId } })).toBe(
        101
      );
    });

    it("keeps the latest event of an open item older than 7 days visible (L2)", async () => {
      const item = await prisma.hubItem.create({
        data: {
          userId: freeId,
          workspaceId: freeWorkspace,
          title: "Old escalation",
          goal: "g",
          doneCriteria: "d",
          context: "c",
          risks: [],
          creatorKind: "owner",
          status: "needs_owner",
          question: "Which one?",
        },
      });
      await prisma.hubItemEvent.create({
        data: {
          itemId: item.id,
          at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          actorKind: "agent",
          type: "escalated",
          message: "Which one?",
        },
      });
      const [listed] = await listItems(freeKey);
      expect(listed.latestEvent).toMatchObject({ type: "escalated" });
    });
  });
});
