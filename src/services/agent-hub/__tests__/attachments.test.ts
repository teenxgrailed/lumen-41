import type { HubAgent } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

import { signLink, verifyLink } from "../attachment-links";
import {
  HUB_ATTACHMENT_ACCOUNT_QUOTA_BYTES,
  HUB_ATTACHMENT_MAX_PER_ITEM,
  HUB_ATTACHMENT_URL_TTL_MS,
} from "../attachment-rules";
import {
  addAttachment,
  listAttachments,
  prepareUpload,
  readAsOwner,
  readSigned,
  receiveUpload,
} from "../attachments";
import type { AgentScope, HubScope } from "../context";

const db = {
  hubItem: { findFirst: jest.fn() },
  hubItemAttachment: {
    count: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  hubItemAttachmentBlob: { create: jest.fn(), findUnique: jest.fn() },
  hubItemEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const canUseHubAttachments = jest.fn();
jest.mock("@/lib/entitlements", () => ({
  canUseHubAttachments: (userId: string) => canUseHubAttachments(userId),
}));
jest.mock("../items", () => ({
  visibleToAgent: (item: { assigneeAgentId: string | null }, agent: HubAgent) =>
    item.assigneeAgentId === agent.id,
}));

const USER = "user-1";
const WORKSPACE = "ws-1";
const agentRow = { id: "a-grok", name: "Grok Bot" } as unknown as HubAgent;
const scope: AgentScope = {
  userId: USER,
  workspaceId: WORKSPACE,
  actor: { kind: "agent", agent: agentRow },
};
const owner: HubScope = {
  userId: USER,
  workspaceId: WORKSPACE,
  actor: { kind: "owner" },
};

const item = {
  id: "item-1",
  userId: USER,
  workspaceId: WORKSPACE,
  assigneeAgentId: "a-grok",
};
const row = (id = "att-1") => ({
  id,
  itemId: "item-1",
  name: "clip.mp4",
  mime: "video/mp4",
  size: 4,
  uploaderKind: "agent",
  uploaderAgentId: "a-grok",
  createdAt: newDate(),
});

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
    fn(db)
  );
  // The lookup only matches the owner's own workspace.
  db.hubItem.findFirst.mockImplementation(
    async ({
      where,
    }: {
      where: { id: string; userId: string; workspaceId: string };
    }) =>
      where.id === item.id &&
      where.userId === USER &&
      where.workspaceId === WORKSPACE
        ? item
        : null
  );
  db.hubItemAttachment.count.mockResolvedValue(0);
  db.hubItemAttachment.aggregate.mockResolvedValue({ _sum: { size: 0 } });
  db.hubItemAttachment.create.mockResolvedValue(row());
  canUseHubAttachments.mockResolvedValue({
    allowed: true,
    upgradeRequired: false,
    plan: "PRO",
  });
});

describe("hub attachments on the Free plan", () => {
  beforeEach(() => {
    canUseHubAttachments.mockResolvedValue({
      allowed: false,
      upgradeRequired: true,
      plan: "FREE",
    });
  });

  const planLimit = {
    code: "PLAN_LIMIT",
    status: 402,
    message: "Upgrade to Pro for attachments",
    extra: { resource: "attachments", plan: "FREE", upgradeRequired: true },
  };

  it("refuses an inline upload with PLAN_LIMIT (402)", async () => {
    await expect(
      addAttachment(scope, {
        itemId: "item-1",
        name: "a.txt",
        contentBase64: b64([65]),
      })
    ).rejects.toMatchObject(planLimit);
    expect(db.hubItemAttachmentBlob.create).not.toHaveBeenCalled();
  });

  it("refuses an upload link", async () => {
    await expect(
      prepareUpload(scope, { itemId: "item-1", name: "a.txt" })
    ).rejects.toMatchObject(planLimit);
  });

  it("refuses the PUT when the plan dropped after the link was made", async () => {
    canUseHubAttachments.mockResolvedValueOnce({
      allowed: true,
      upgradeRequired: false,
      plan: "PRO",
    });
    const { uploadUrl } = await prepareUpload(scope, {
      itemId: "item-1",
      name: "a.txt",
    });
    const token = new URL(uploadUrl, "http://x").searchParams.get("t");
    await expect(receiveUpload(token, Buffer.from([65]))).rejects.toMatchObject(
      planLimit
    );
    expect(db.hubItemAttachmentBlob.create).not.toHaveBeenCalled();
  });

  it("still lists files already stored", async () => {
    db.hubItemAttachment.findMany.mockResolvedValue([row()]);
    await expect(listAttachments(scope, "item-1")).resolves.toBeDefined();
  });
});

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

describe("hub attachments", () => {
  it("stores a file, writes the bytes and logs an event", async () => {
    const { attachment } = await addAttachment(scope, {
      itemId: "item-1",
      name: "clip.mp4",
      contentBase64: b64([1, 2, 3, 4]),
    });
    expect(attachment.url).toContain("/api/connect/agent-hub/files?t=");
    expect(db.hubItemAttachmentBlob.create).toHaveBeenCalledTimes(1);
    expect(db.hubItemEvent.create.mock.calls[0][0].data).toMatchObject({
      type: "attachment_added",
      actorKind: "agent",
      actorAgentId: "a-grok",
    });
  });

  it("refuses the eleventh file on an item", async () => {
    db.hubItemAttachment.count.mockResolvedValue(HUB_ATTACHMENT_MAX_PER_ITEM);
    await expect(
      addAttachment(scope, {
        itemId: "item-1",
        name: "a.txt",
        contentBase64: b64([65]),
      })
    ).rejects.toMatchObject({ extra: { reason: "TOO_MANY" } });
    expect(db.hubItemAttachmentBlob.create).not.toHaveBeenCalled();
  });

  it("refuses a file that would pass the 500 MB account quota", async () => {
    db.hubItemAttachment.aggregate.mockResolvedValue({
      _sum: { size: HUB_ATTACHMENT_ACCOUNT_QUOTA_BYTES - 2 },
    });
    await expect(
      addAttachment(scope, {
        itemId: "item-1",
        name: "a.txt",
        contentBase64: b64([65, 66, 67]),
      })
    ).rejects.toMatchObject({ extra: { reason: "QUOTA" }, status: 413 });
  });

  it("refuses oversized base64 before decoding it", async () => {
    await expect(
      addAttachment(scope, {
        itemId: "item-1",
        name: "a.zip",
        contentBase64: "A".repeat(40 * 1024 * 1024),
      })
    ).rejects.toMatchObject({ extra: { reason: "TOO_LARGE" } });
  });

  describe("other workspaces and agents", () => {
    it("an item of another workspace does not exist", async () => {
      const elsewhere: AgentScope = { ...scope, workspaceId: "ws-other" };
      await expect(listAttachments(elsewhere, "item-1")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        addAttachment(elsewhere, {
          itemId: "item-1",
          name: "a.txt",
          contentBase64: b64([65]),
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        prepareUpload(elsewhere, { itemId: "item-1", name: "a.mp4" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("an agent the item does not concern cannot see its files", async () => {
      const stranger: AgentScope = {
        ...scope,
        actor: {
          kind: "agent",
          agent: { ...agentRow, id: "a-other" } as HubAgent,
        },
      };
      await expect(listAttachments(stranger, "item-1")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("the owner download is limited to the workspace", async () => {
      db.hubItemAttachment.findFirst.mockResolvedValue(null);
      await expect(
        readAsOwner({ ...owner, workspaceId: "ws-other" }, "att-1")
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(
        db.hubItemAttachment.findFirst.mock.calls[0][0].where
      ).toMatchObject({
        workspaceId: "ws-other",
      });
    });
  });

  describe("signed links", () => {
    it("lists files with 24 hour download links", async () => {
      db.hubItemAttachment.findMany.mockResolvedValue([row()]);
      const before = newDate().getTime();
      const { attachments } = await listAttachments(scope, "item-1");
      const token = new URL(attachments[0].url).searchParams.get("t");
      const claims = verifyLink<{ a: string }>("get", token, before);
      expect(claims?.a).toBe("att-1");
      const ttl = new Date(attachments[0].urlExpiresAt).getTime() - before;
      expect(ttl).toBeGreaterThanOrEqual(HUB_ATTACHMENT_URL_TTL_MS - 1000);
      expect(ttl).toBeLessThanOrEqual(HUB_ATTACHMENT_URL_TTL_MS + 5000);
    });

    it("a link is valid just before 24 hours and dead after", () => {
      const { token } = signLink(
        "get",
        { a: "att-1", u: USER },
        HUB_ATTACHMENT_URL_TTL_MS,
        1_000
      );
      expect(
        verifyLink("get", token, 1_000 + HUB_ATTACHMENT_URL_TTL_MS - 1)
      ).not.toBeNull();
      expect(
        verifyLink("get", token, 1_000 + HUB_ATTACHMENT_URL_TTL_MS)
      ).toBeNull();
    });

    it("an expired or tampered download link reads nothing", async () => {
      const { token } = signLink("get", { a: "att-1", u: USER }, 1000, 1_000);
      await expect(readSigned(token, 5_000)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      const forged = `${Buffer.from(JSON.stringify({ a: "att-2", u: USER, x: 9e15 })).toString("base64url")}.${token.split(".")[1]}`;
      await expect(readSigned(forged, 1_500)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(db.hubItemAttachment.findFirst).not.toHaveBeenCalled();
    });

    it("a download link cannot be used to upload, nor the reverse", () => {
      const { token } = signLink("get", { a: "att-1", u: USER }, 1000, 1_000);
      expect(verifyLink("put", token, 1_500)).toBeNull();
    });

    it("serves the bytes for a live link", async () => {
      db.hubItemAttachment.findFirst.mockResolvedValue({
        name: "clip.mp4",
        mime: "video/mp4",
        storageKey: "k1",
      });
      db.hubItemAttachmentBlob.findUnique.mockResolvedValue({
        bytes: Buffer.from([1, 2]),
      });
      const { token } = signLink("get", { a: "att-1", u: USER }, 1000, 1_000);
      const file = await readSigned(token, 1_500);
      expect(file.mime).toBe("video/mp4");
      expect(file.bytes.length).toBe(2);
    });
  });

  describe("upload link", () => {
    it("is issued for a valid name and refused for an executable", async () => {
      const prepared = await prepareUpload(scope, {
        itemId: "item-1",
        name: "demo.mp4",
      });
      expect(prepared.uploadUrl).toContain("/api/connect/agent-hub/uploads?t=");
      expect(prepared.maxBytes).toBe(25 * 1024 * 1024);
      await expect(
        prepareUpload(scope, { itemId: "item-1", name: "demo.exe" })
      ).rejects.toMatchObject({ extra: { reason: "EXECUTABLE" } });
    });

    it("stores the PUT bytes, and an expired link stores nothing", async () => {
      const prepared = await prepareUpload(scope, {
        itemId: "item-1",
        name: "demo.mp4",
      });
      const token = new URL(prepared.uploadUrl).searchParams.get("t");
      await expect(
        receiveUpload(
          token,
          Buffer.from([1, 2, 3, 4]),
          newDate().getTime() + 16 * 60_000
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.hubItemAttachmentBlob.create).not.toHaveBeenCalled();
      await receiveUpload(token, Buffer.from([1, 2, 3, 4]));
      expect(db.hubItemAttachmentBlob.create).toHaveBeenCalledTimes(1);
    });

    it("checks the bytes again when they arrive", async () => {
      const prepared = await prepareUpload(scope, {
        itemId: "item-1",
        name: "demo.mp4",
      });
      const token = new URL(prepared.uploadUrl).searchParams.get("t");
      await expect(
        receiveUpload(token, Buffer.from([0x4d, 0x5a, 0, 0]))
      ).rejects.toMatchObject({ extra: { reason: "EXECUTABLE" } });
    });
  });
});
