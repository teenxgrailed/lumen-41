import { NextRequest, NextResponse } from "next/server";

import { HubError } from "@/services/agent-hub/errors";

import {
  DELETE as deleteRoute,
  GET as downloadRoute,
} from "../attachments/[id]/route";
import { POST as uploadRoute } from "../items/[id]/attachments/route";

jest.mock("@/services/agent-hub/register", () => ({}));
const authenticateHubOwner = jest.fn();
jest.mock("@/services/agent-hub/http", () => ({
  authenticateHubOwner: (...args: unknown[]) => authenticateHubOwner(...args),
  hubRoute: async (work: () => Promise<NextResponse>) => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HubError) {
        return NextResponse.json(error.body(), { status: error.status });
      }
      throw error;
    }
  },
}));
const addAttachment = jest.fn();
const deleteAttachment = jest.fn();
const readAsOwner = jest.fn();
jest.mock("@/services/agent-hub/attachments", () => ({
  addAttachment: (...args: unknown[]) => addAttachment(...args),
  deleteAttachment: (...args: unknown[]) => deleteAttachment(...args),
  readAsOwner: (...args: unknown[]) => readAsOwner(...args),
  listAttachments: jest.fn(),
}));
const enforceRateLimits = jest.fn();
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: (...args: unknown[]) => enforceRateLimits(...args),
  accountRule: (_value: string, namespace: string) => ({ namespace }),
}));

const SCOPE = {
  userId: "user-1",
  workspaceId: "ws-1",
  actor: { kind: "owner" },
};
const ctx = { params: Promise.resolve({ id: "item-1" }) };

function multipart(file: File | null) {
  const form = new FormData();
  if (file) form.append("file", file);
  return new NextRequest(
    "http://localhost/api/agent-hub/items/item-1/attachments",
    {
      method: "POST",
      body: form,
    }
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  authenticateHubOwner.mockResolvedValue({ scope: SCOPE });
  enforceRateLimits.mockResolvedValue(null);
});

describe("owner POST /api/agent-hub/items/[id]/attachments", () => {
  it("reads the multipart file and attaches it as the owner", async () => {
    addAttachment.mockResolvedValue({ attachment: { id: "att-1" } });
    const response = await uploadRoute(
      multipart(
        new File(["%PDF-1.7"], "brief.pdf", { type: "application/pdf" })
      ),
      ctx
    );
    expect(response.status).toBe(201);
    const call = addAttachment.mock.calls[0];
    expect(call[0]).toBe(SCOPE);
    expect(call[1]).toMatchObject({
      itemId: "item-1",
      name: "brief.pdf",
      mime: "application/pdf",
    });
    expect(Buffer.isBuffer(call[1].bytes)).toBe(true);
    expect(authenticateHubOwner).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("answers 400 when there is no file part", async () => {
    const response = await uploadRoute(multipart(null), ctx);
    expect(response.status).toBe(400);
    expect(addAttachment).not.toHaveBeenCalled();
  });

  it("answers 413 from Content-Length before reading a body over 25 MB", async () => {
    const request = new NextRequest(
      "http://localhost/api/agent-hub/items/item-1/attachments",
      {
        method: "POST",
        body: "x",
        headers: { "content-length": String(26 * 1024 * 1024 + 100_000) },
      }
    );
    expect((await uploadRoute(request, ctx)).status).toBe(413);
    expect(addAttachment).not.toHaveBeenCalled();
  });

  it("is rate limited per account", async () => {
    enforceRateLimits.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const response = await uploadRoute(
      multipart(new File(["a"], "a.txt")),
      ctx
    );
    expect(response.status).toBe(429);
    expect(addAttachment).not.toHaveBeenCalled();
  });

  it("returns the auth refusal untouched (a bearer token is never the owner)", async () => {
    authenticateHubOwner.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect(
      (await uploadRoute(multipart(new File(["a"], "a.txt")), ctx)).status
    ).toBe(401);
    expect(addAttachment).not.toHaveBeenCalled();
  });

  it("passes a service refusal through with its status", async () => {
    addAttachment.mockRejectedValue(
      new HubError("INVALID", "Allowed: images", { reason: "BAD_TYPE" }, 400)
    );
    const response = await uploadRoute(
      multipart(new File(["a"], "a.xyz")),
      ctx
    );
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe("BAD_TYPE");
  });
});

describe("owner DELETE and GET /api/agent-hub/attachments/[id]", () => {
  const request = (method: string) =>
    new NextRequest("http://localhost/api/agent-hub/attachments/att-1", {
      method,
    });
  const attCtx = { params: Promise.resolve({ id: "att-1" }) };

  it("removes a file for an editor (write auth)", async () => {
    deleteAttachment.mockResolvedValue({ deleted: true });
    const response = await deleteRoute(request("DELETE"), attCtx);
    expect(await response.json()).toEqual({ deleted: true });
    expect(authenticateHubOwner).toHaveBeenCalledWith(expect.anything(), true);
    expect(deleteAttachment).toHaveBeenCalledWith(SCOPE, "att-1");
  });

  it("answers 404 for a file of another workspace", async () => {
    deleteAttachment.mockRejectedValue(
      new HubError("NOT_FOUND", "Attachment not found.")
    );
    expect((await deleteRoute(request("DELETE"), attCtx)).status).toBe(404);
  });

  it("downloads with read auth as a sandboxed attachment", async () => {
    readAsOwner.mockResolvedValue({
      name: "a.txt",
      mime: "text/plain",
      bytes: Buffer.from("hi"),
    });
    const response = await downloadRoute(request("GET"), attCtx);
    expect(authenticateHubOwner).toHaveBeenCalledWith(expect.anything(), false);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
