import { NextRequest } from "next/server";

import { POST } from "@/app/api/webhooks/resend/route";
import { createHmac } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    resendWebhookEvent: {
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    emailSuppression: { upsert: jest.fn() },
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    notificationSettings: { updateMany: jest.fn() },
    emailPreference: { upsert: jest.fn() },
    emailSend: { updateMany: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  },
}));

const SECRET_BYTES = Buffer.from("resend-test-secret-0123456789abc");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;

function signed(
  body: string,
  options: { id?: string; timestamp?: number; secret?: Buffer } = {}
) {
  const id = options.id ?? "msg_1";
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", options.secret ?? SECRET_BYTES)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new NextRequest("http://localhost/api/webhooks/resend", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  });
}

const bounce = (type: string) =>
  JSON.stringify({
    type: "email.bounced",
    data: { to: ["Person@Example.com"], bounce: { type } },
  });

describe("Resend webhook", () => {
  const saved = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    jest
      .mocked(prisma.resendWebhookEvent.create)
      .mockResolvedValue({} as never);
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ id: "u1" } as never);
  });

  afterAll(() => {
    process.env.RESEND_WEBHOOK_SECRET = saved;
  });

  it("refuses a wrong signature and stores nothing", async () => {
    const response = await POST(
      signed(bounce("Permanent"), { secret: Buffer.from("another-secret") })
    );
    expect(response.status).toBe(400);
    expect(prisma.resendWebhookEvent.create).not.toHaveBeenCalled();
    expect(prisma.emailSuppression.upsert).not.toHaveBeenCalled();
  });

  it("refuses a timestamp older than five minutes", async () => {
    const old = Math.floor(Date.now() / 1000) - 6 * 60;
    const response = await POST(
      signed(bounce("Permanent"), { timestamp: old })
    );
    expect(response.status).toBe(400);
    expect(prisma.emailSuppression.upsert).not.toHaveBeenCalled();
  });

  it("refuses a request with no signature headers", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: bounce("Permanent"),
      })
    );
    expect(response.status).toBe(400);
  });

  it("suppresses the address on a hard bounce, matching case-insensitively", async () => {
    const response = await POST(signed(bounce("Permanent")));
    expect(response.status).toBe(200);
    expect(prisma.emailSuppression.upsert).toHaveBeenCalledTimes(1);
    const call = jest.mocked(prisma.emailSuppression.upsert).mock.calls[0][0];
    expect(call.create.reason).toBe("bounce");
    expect(call.create.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(call)).not.toContain("example.com");
  });

  it("counts a soft bounce but does not suppress", async () => {
    const response = await POST(signed(bounce("Transient")));
    expect(response.status).toBe(200);
    expect(prisma.emailSuppression.upsert).not.toHaveBeenCalled();
  });

  it("suppresses on a complaint and switches optional mail off", async () => {
    const body = JSON.stringify({
      type: "email.complained",
      data: { to: ["person@example.com"] },
    });
    const response = await POST(signed(body));
    expect(response.status).toBe(200);
    expect(prisma.emailSuppression.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { commercialEmailsOptOutAt: expect.any(Date) },
      })
    );
    expect(prisma.notificationSettings.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { digest: false },
    });
  });

  it("switches every optional category off on a complaint, source complaint", async () => {
    const body = JSON.stringify({
      type: "email.complained",
      data: { to: ["person@example.com"], email_id: "re_1" },
    });
    await POST(signed(body));
    const sources = jest
      .mocked(prisma.emailPreference.upsert)
      .mock.calls.map((call) => call[0].create.source);
    expect(sources).toHaveLength(4);
    expect(new Set(sources)).toEqual(new Set(["complaint"]));
    expect(prisma.emailSend.updateMany).toHaveBeenCalledWith({
      where: { resendId: "re_1", status: "sent", reason: null },
      data: { reason: "complained" },
    });
  });

  it("counts opens and clicks only while the tracking window is open", async () => {
    const opened = JSON.stringify({
      type: "email.opened",
      data: { email_id: "re_2" },
    });
    jest.mocked(prisma.systemSettings.findFirst).mockResolvedValue({
      emailTrackingEndsAt: new Date(Date.now() + 86_400_000),
    } as never);
    await POST(signed(opened, { id: "msg_open_1" }));
    expect(prisma.emailSend.updateMany).toHaveBeenCalledWith({
      where: { resendId: "re_2" },
      data: { opens: { increment: 1 } },
    });

    jest.mocked(prisma.emailSend.updateMany).mockClear();
    jest.mocked(prisma.systemSettings.findFirst).mockResolvedValue({
      emailTrackingEndsAt: new Date(Date.now() - 1000),
    } as never);
    await POST(signed(opened, { id: "msg_open_2" }));
    expect(prisma.emailSend.updateMany).not.toHaveBeenCalled();
  });

  it("does not count tracking events when no end date is set", async () => {
    jest.mocked(prisma.systemSettings.findFirst).mockResolvedValue({
      emailTrackingEndsAt: null,
    } as never);
    const clicked = JSON.stringify({
      type: "email.clicked",
      data: { email_id: "re_3" },
    });
    await POST(signed(clicked, { id: "msg_click_1" }));
    expect(prisma.emailSend.updateMany).not.toHaveBeenCalled();
  });

  it("acknowledges a retried event without applying it twice", async () => {
    jest.mocked(prisma.resendWebhookEvent.create).mockRejectedValueOnce({
      code: "P2002",
    });
    const response = await POST(signed(bounce("Permanent")));
    expect(response.status).toBe(200);
    expect(prisma.emailSuppression.upsert).not.toHaveBeenCalled();
  });

  it("ignores an event type it does not handle", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: {} });
    const response = await POST(signed(body));
    expect(response.status).toBe(200);
    expect(prisma.emailSuppression.upsert).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Resend event accepted",
      { id: "msg_1", type: "email.delivered" },
      "ResendWebhookRoute"
    );
  });

  it("forgets the event id when applying fails, so the retry is applied", async () => {
    jest
      .mocked(prisma.emailSuppression.upsert)
      .mockRejectedValueOnce(new Error("db down"));
    const response = await POST(signed(bounce("Permanent")));
    expect(response.status).toBe(500);
    expect(prisma.resendWebhookEvent.delete).toHaveBeenCalledWith({
      where: { id: "msg_1" },
    });
  });

  it("answers 503 while no secret is configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const response = await POST(signed(bounce("Permanent")));
    expect(response.status).toBe(503);
  });
});
