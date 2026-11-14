import { NextRequest, NextResponse } from "next/server";

import { POST } from "@/app/api/auth/email-code/request/route";

import { sendLoginCode } from "@/lib/auth/email-code-service";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((value: string, namespace: string, limit: number) => ({
    identifier: value,
    namespace,
    limit,
  })),
  ipRule: jest.fn((_r: unknown, namespace: string, limit: number) => ({
    identifier: "ip",
    namespace,
    limit,
  })),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/lib/auth/email-code-service", () => ({
  sendLoginCode: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function requestFor(body: unknown) {
  return new NextRequest("http://localhost/api/auth/email-code/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  jest
    .mocked(ipRule)
    .mockImplementation(
      (_r, namespace, limit) =>
        ({ identifier: "ip", namespace, limit }) as never
    );
  jest
    .mocked(accountRule)
    .mockImplementation(
      (value, namespace, limit) =>
        ({ identifier: value, namespace, limit }) as never
    );
});

describe("POST /api/auth/email-code/request", () => {
  it("answers the same for a sent code and a silent skip", async () => {
    jest.mocked(sendLoginCode).mockResolvedValueOnce("sent");
    const sent = await POST(requestFor({ email: "A@Example.com" }));
    jest.mocked(sendLoginCode).mockResolvedValueOnce("skipped");
    const skipped = await POST(requestFor({ email: "b@example.com" }));
    expect(sent.status).toBe(200);
    expect(skipped.status).toBe(200);
    expect(await sent.json()).toEqual(await skipped.json());
    expect(sendLoginCode).toHaveBeenCalledWith("a@example.com");
  });

  it("limits per address (1 per 60 s, 5 per hour) and per IP", async () => {
    jest.mocked(sendLoginCode).mockResolvedValue("sent");
    await POST(requestFor({ email: "a@example.com" }));
    const rules = jest.mocked(enforceRateLimits).mock
      .calls[0][0] as unknown as {
      namespace: string;
      limit: number;
    }[];
    expect(rules.map((r) => `${r.namespace}:${r.limit}`)).toEqual([
      "email-code:ip:10",
      "email-code:account-resend:1",
      "email-code:account:5",
      "email-code:account-day:10",
    ]);
    expect(jest.mocked(accountRule).mock.calls[0]).toEqual([
      "a@example.com",
      "email-code:account-resend",
      1,
      60,
    ]);
  });

  it("sends nothing when rate limited", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const res = await POST(requestFor({ email: "a@example.com" }));
    expect(res.status).toBe(429);
    expect(sendLoginCode).not.toHaveBeenCalled();
  });

  it("rejects something that is not an address", async () => {
    const res = await POST(requestFor({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(sendLoginCode).not.toHaveBeenCalled();
    expect(enforceRateLimits).not.toHaveBeenCalled();
  });

  it("answers 503 when the mail cannot go out", async () => {
    jest.mocked(sendLoginCode).mockRejectedValue(new Error("resend down"));
    const res = await POST(requestFor({ email: "a@example.com" }));
    expect(res.status).toBe(503);
  });
});
