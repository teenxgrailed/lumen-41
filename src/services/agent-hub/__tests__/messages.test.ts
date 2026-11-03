/**
 * Hub mail: send, read (unread first, marks read), acknowledge, a message to
 * the owner (alert, never an item change), refusal of credential-looking
 * text, the per-minute send limit. No database: prisma is a mock with no
 * `hubItem.update`, so any code path that tried to change an item would throw.
 */
import type { HubAgent, HubMessage, HubThread } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

import type { AgentScope, HubScope } from "../context";
import {
  ackMessage,
  isRecipient,
  listMessages,
  ownerPost,
  readThread,
  sendMessage,
} from "../messages";

const db = {
  hubAgent: { findFirst: jest.fn(), findMany: jest.fn() },
  hubItem: { findFirst: jest.fn() },
  hubThread: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  hubMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  hubMessageReceipt: { upsert: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const pushOwnerAlert = jest.fn();
jest.mock("../alerts", () => ({
  pushOwnerAlert: (...args: unknown[]) => pushOwnerAlert(...args),
}));

// Built at run time so secret scanners do not flag the fixture.
const AWS_KEY = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");

const USER = "user-1";
const WORKSPACE = "ws-1";

function agent(id: string, name: string, skills: string[] = []): HubAgent {
  return {
    id,
    userId: USER,
    workspaceId: WORKSPACE,
    connectionKey: `token:${id}`,
    name,
    kind: "other",
    capabilities: "",
    skills,
    limits: null,
    lastSeenAt: null,
    disabledAt: null,
    createdAt: newDate(),
    updatedAt: newDate(),
  };
}
const grok = agent("a-grok", "Grok Bot", ["browser"]);
const codex = agent("a-codex", "Codex", ["code"]);
const agents = [grok, codex];

const scopeOf = (a: HubAgent): AgentScope => ({
  userId: USER,
  workspaceId: WORKSPACE,
  actor: { kind: "agent", agent: a },
});
const OWNER: HubScope = {
  userId: USER,
  workspaceId: WORKSPACE,
  actor: { kind: "owner" },
};

function thread(extra: Partial<HubThread> = {}): HubThread {
  return {
    id: "t-1",
    userId: USER,
    workspaceId: WORKSPACE,
    subject: "Instagram login",
    itemId: null,
    ownerUnread: false,
    lastMessageAt: newDate(),
    createdAt: newDate(),
    ...extra,
  };
}

type TestReceipt = { agentId: string; readAt: Date | null; ackAt: Date | null };

function message(
  extra: Partial<HubMessage> & { receipts?: TestReceipt[] } = {}
) {
  return {
    id: "m-1",
    threadId: "t-1",
    userId: USER,
    workspaceId: WORKSPACE,
    fromKind: "agent",
    fromAgentId: grok.id,
    toAgentIds: [codex.id],
    toOwner: false,
    toAny: false,
    anySkills: [],
    body: "Can you check the login page?",
    importance: "normal",
    ackRequired: false,
    createdAt: newDate(),
    receipts: [] as TestReceipt[],
    ...extra,
  } as HubMessage & { receipts: TestReceipt[] };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.hubAgent.findFirst.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      agents.find((a) => a.id === where.id) ?? null
  );
  db.hubAgent.findMany.mockImplementation(
    async ({
      where,
    }: {
      where: { id?: { in: string[] }; name?: { equals: string } };
    }) =>
      agents.filter((a) =>
        where.id
          ? where.id.in.includes(a.id)
          : a.name.toLowerCase() === where.name?.equals.toLowerCase()
      )
  );
  db.hubMessage.count.mockResolvedValue(0);
  db.hubThread.create.mockImplementation(
    async ({ data }: { data: Partial<HubThread> }) =>
      thread({ subject: data.subject })
  );
  db.hubMessage.create.mockImplementation(
    async ({ data }: { data: Partial<HubMessage> }) => message(data)
  );
  db.hubThread.update.mockResolvedValue({});
  db.hubMessageReceipt.upsert.mockResolvedValue({});
  pushOwnerAlert.mockResolvedValue({ sent: 1, skipped: false });
});

describe("sendMessage", () => {
  it("starts a thread between agents without alerting the owner", async () => {
    const sent = await sendMessage(scopeOf(grok), {
      to: ["codex"],
      subject: "Instagram login",
      body: "Can you check the login page?",
    });
    expect(db.hubMessage.create.mock.calls[0][0].data).toMatchObject({
      fromKind: "agent",
      fromAgentId: grok.id,
      toAgentIds: [codex.id],
      toOwner: false,
    });
    expect(pushOwnerAlert).not.toHaveBeenCalled();
    expect(db.hubThread.update.mock.calls[0][0].data).not.toHaveProperty(
      "ownerUnread"
    );
    expect(sent.message.from).toMatchObject({
      kind: "agent",
      name: "Grok Bot",
    });
  });

  it("alerts the owner like an escalation, and never touches an item", async () => {
    await sendMessage(scopeOf(grok), {
      to: ["owner"],
      subject: "Need a decision",
      body: "Two accounts could post this. Which one?",
      importance: "high",
    });
    expect(db.hubThread.update.mock.calls[0][0].data.ownerUnread).toBe(true);
    expect(pushOwnerAlert).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        title: "Urgent from Grok Bot",
        url: "/agents?thread=t-1",
      })
    );
    // The mock has no hubItem.update / updateMany: an item write would throw.
    expect("update" in db.hubItem).toBe(false);
  });

  it("refuses credential-looking text and creates nothing", async () => {
    await expect(
      sendMessage(scopeOf(grok), {
        to: ["codex"],
        body: `use this key ${AWS_KEY} for the upload`,
      })
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      sendMessage(scopeOf(grok), {
        to: ["codex"],
        subject: `key ${AWS_KEY}`,
        body: "see subject",
      })
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(db.hubThread.create).not.toHaveBeenCalled();
    expect(db.hubMessage.create).not.toHaveBeenCalled();
  });

  it("limits sends per minute", async () => {
    db.hubMessage.count.mockResolvedValue(20);
    await expect(
      sendMessage(scopeOf(grok), { to: ["codex"], body: "again" })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(db.hubMessage.create).not.toHaveBeenCalled();
  });

  it("refuses an unknown agent, yourself, and any without skills", async () => {
    await expect(
      sendMessage(scopeOf(grok), { to: ["nobody"], body: "hi" })
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      sendMessage(scopeOf(grok), { to: ["Grok Bot"], body: "hi" })
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      sendMessage(scopeOf(grok), { to: ["any"], body: "hi" })
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("stores skills for a message to any", async () => {
    await sendMessage(scopeOf(grok), {
      to: ["any"],
      skills: ["Code"],
      body: "Who can review a diff?",
    });
    expect(db.hubMessage.create.mock.calls[0][0].data).toMatchObject({
      toAny: true,
      anySkills: ["code"],
      toAgentIds: [],
    });
  });

  it("will not let an agent post into a thread it is not part of", async () => {
    db.hubThread.findFirst.mockResolvedValue(thread());
    db.hubMessage.findMany.mockResolvedValue([
      message({ fromAgentId: "a-other", toAgentIds: ["a-third"] }),
    ]);
    await expect(
      sendMessage(scopeOf(grok), {
        to: ["codex"],
        body: "butting in",
        threadId: "t-1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("recipients", () => {
  it("matches named agents and any-by-skills, never the sender", () => {
    const named = message();
    expect(isRecipient(named, codex)).toBe(true);
    expect(isRecipient(named, grok)).toBe(false);
    const any = message({ toAgentIds: [], toAny: true, anySkills: ["code"] });
    expect(isRecipient(any, codex)).toBe(true);
    expect(isRecipient({ ...any, fromAgentId: codex.id }, codex)).toBe(false);
    expect(isRecipient(any, grok)).toBe(false);
  });
});

describe("listMessages", () => {
  it("returns unread first, marks them read and marks the text untrusted", async () => {
    const unread = message({ id: "m-new" });
    const old = message({
      id: "m-old",
      threadId: "t-2",
      receipts: [{ agentId: codex.id, readAt: newDate(), ackAt: null }],
    });
    const forSomeoneElse = message({ id: "m-x", toAgentIds: ["a-other"] });
    db.hubMessage.findMany.mockResolvedValue([old, unread, forSomeoneElse]);
    db.hubThread.findMany.mockResolvedValue([
      thread({ id: "t-1" }),
      thread({ id: "t-2", subject: "Old" }),
    ]);
    const result = await listMessages(scopeOf(codex));
    expect(result.untrusted).toBe(true);
    expect(result.threads.map((t) => t.id)).toEqual(["t-1", "t-2"]);
    expect(result.threads[0].unread).toBe(1);
    expect(result.threads[0].messages[0]).toMatchObject({
      id: "m-new",
      read: false,
      untrusted: true,
    });
    expect(result.unreadMessages).toBe(1);
    expect(db.hubMessageReceipt.upsert).toHaveBeenCalledTimes(1);
    expect(db.hubMessageReceipt.upsert.mock.calls[0][0].where).toEqual({
      messageId_agentId: { messageId: "m-new", agentId: codex.id },
    });
  });

  it("lists the ids still owed an acknowledgement", async () => {
    db.hubMessage.findMany.mockResolvedValue([
      message({ id: "m-ack", ackRequired: true }),
    ]);
    db.hubThread.findMany.mockResolvedValue([thread()]);
    const result = await listMessages(scopeOf(codex), { unreadOnly: true });
    expect(result.ackRequired).toEqual(["m-ack"]);
  });
});

describe("ackMessage", () => {
  it("records the acknowledgement for a recipient", async () => {
    db.hubMessage.findFirst.mockResolvedValue(message({ ackRequired: true }));
    expect(await ackMessage(scopeOf(codex), "m-1")).toEqual({
      acked: true,
      messageId: "m-1",
    });
    const call = db.hubMessageReceipt.upsert.mock.calls[0][0];
    expect(call.update.ackAt).toBeInstanceOf(Date);
    expect(call.update.readAt).toBeInstanceOf(Date);
  });

  it("answers not found for a message that was not written to the agent", async () => {
    db.hubMessage.findFirst.mockResolvedValue(
      message({ toAgentIds: ["a-other"] })
    );
    await expect(ackMessage(scopeOf(codex), "m-1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.hubMessageReceipt.upsert).not.toHaveBeenCalled();
  });
});

describe("readThread", () => {
  it("marks the agent's unread messages read and keeps text untrusted", async () => {
    db.hubThread.findFirst.mockResolvedValue(thread());
    db.hubMessage.findMany.mockResolvedValue([message()]);
    const result = await readThread(scopeOf(codex), "t-1");
    expect(result.untrusted).toBe(true);
    expect(result.messages[0]).toMatchObject({ read: true, untrusted: true });
    expect(db.hubMessageReceipt.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("ownerPost", () => {
  it("replies to every agent that took part in the thread", async () => {
    db.hubThread.findFirst.mockResolvedValue(thread());
    db.hubMessage.findMany.mockResolvedValue([message()]);
    await ownerPost(OWNER, {
      threadId: "t-1",
      body: "Use the second account.",
    });
    const data = db.hubMessage.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ fromKind: "owner", fromAgentId: null });
    expect([...data.toAgentIds].sort()).toEqual([codex.id, grok.id].sort());
    expect(pushOwnerAlert).not.toHaveBeenCalled();
  });

  it("is refused for an agent scope", async () => {
    await expect(
      ownerPost(scopeOf(grok), { body: "I am the owner", to: ["codex"] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
