import { NextRequest, NextResponse } from "next/server";

import { HubError } from "@/services/agent-hub/errors";

import { GET as downloadRoute } from "../files/route";
import { PUT as uploadRoute } from "../uploads/route";

jest.mock("@/services/agent-hub/register", () => ({}));
const receiveUpload = jest.fn();
const readSigned = jest.fn();
jest.mock("@/services/agent-hub/attachments", () => ({
  receiveUpload: (...args: unknown[]) => receiveUpload(...args),
  readSigned: (...args: unknown[]) => readSigned(...args),
}));
const enforceRateLimits = jest.fn();
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: (...args: unknown[]) => enforceRateLimits(...args),
  ipRule: (_request: unknown, namespace: string) => ({ namespace }),
}));

const MAX = 25 * 1024 * 1024;
const put = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/connect/agent-hub/uploads?t=tok", {
    method: "PUT",
    body,
    headers,
  });

beforeEach(() => {
  jest.resetAllMocks();
  enforceRateLimits.mockResolvedValue(null);
});

describe("PUT /api/connect/agent-hub/uploads", () => {
  it("stores the bytes for a good link and answers 201", async () => {
    receiveUpload.mockResolvedValue({ attachment: { id: "att-1" } });
    const response = await uploadRoute(put(Buffer.from("hello")));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ attachment: { id: "att-1" } });
    expect(receiveUpload).toHaveBeenCalledWith("tok", expect.any(Buffer));
  });

  it("answers 403 for a bad or expired link", async () => {
    receiveUpload.mockRejectedValue(
      new HubError("FORBIDDEN", "This upload link is invalid or has expired.")
    );
    const response = await uploadRoute(put(Buffer.from("x")));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("FORBIDDEN");
  });

  it("answers 413 from Content-Length without reading the body", async () => {
    const response = await uploadRoute(
      put(Buffer.from("x"), { "content-length": String(MAX + 1) })
    );
    expect(response.status).toBe(413);
    expect(receiveUpload).not.toHaveBeenCalled();
  });

  it("answers 413 once more than 25 MB has arrived", async () => {
    const response = await uploadRoute(put(Buffer.alloc(MAX + 10, 1)));
    expect(response.status).toBe(413);
    expect(receiveUpload).not.toHaveBeenCalled();
  });

  it("is rate limited by address before anything is read", async () => {
    enforceRateLimits.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const response = await uploadRoute(put(Buffer.from("x")));
    expect(response.status).toBe(429);
    expect(receiveUpload).not.toHaveBeenCalled();
  });

  it("answers 404 when the hub is off for the account", async () => {
    receiveUpload.mockRejectedValue(new HubError("NOT_FOUND", "Not found"));
    expect((await uploadRoute(put(Buffer.from("x")))).status).toBe(404);
  });
});

describe("GET /api/connect/agent-hub/files", () => {
  const get = (query = "?t=tok") =>
    new NextRequest(`http://localhost/api/connect/agent-hub/files${query}`);

  it("serves the file as a sandboxed, non-sniffed download", async () => {
    readSigned.mockResolvedValue({
      name: 'clip "1".mp4',
      mime: "video/mp4",
      bytes: Buffer.from("abc"),
    });
    const response = await downloadRoute(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox"
    );
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="clip _1_\.mp4"/
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("abc");
  });

  it("answers 403 for a bad link and passes a missing token as null", async () => {
    readSigned.mockRejectedValue(
      new HubError("FORBIDDEN", "This download link is invalid or has expired.")
    );
    expect((await downloadRoute(get("?t=bad"))).status).toBe(403);
    await downloadRoute(get(""));
    expect(readSigned).toHaveBeenLastCalledWith(null);
  });

  it("is rate limited", async () => {
    enforceRateLimits.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    expect((await downloadRoute(get())).status).toBe(429);
    expect(readSigned).not.toHaveBeenCalled();
  });
});
