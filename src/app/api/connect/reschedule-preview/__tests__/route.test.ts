import { NextRequest } from "next/server";

import { SchedulePreviewConflictError } from "@/services/ai/reschedule-preview";
import { runReschedulePreviewAction } from "@/services/ai/reschedule-preview-api";
import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { sendConnectorWebhook } from "@/services/connectors/webhooks";

import { POST } from "../route";

jest.mock("@/services/connectors/auth", () => ({
  authenticateConnectorRequest: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/ai/reschedule-preview", () => ({
  SchedulePreviewConflictError: class extends Error {},
}));
jest.mock("@/services/ai/reschedule-preview-api", () => ({
  runReschedulePreviewAction: jest.fn(),
}));
const limit = jest.fn().mockResolvedValue(null);
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((...a: unknown[]) => a),
  enforceRateLimits: (...a: unknown[]) => limit(...a),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const call = async (body: unknown) =>
  (await POST(
    new NextRequest("http://localhost/api/connect/reschedule-preview", {
      method: "POST",
      body: JSON.stringify(body),
    })
  ))!;

beforeEach(() => {
  jest.clearAllMocks();
  limit.mockResolvedValue(null);
  jest.mocked(authenticateConnectorRequest).mockResolvedValue({
    userId: "u1",
    workspace: { workspaceId: "w1" },
  } as never);
  jest
    .mocked(runReschedulePreviewAction)
    .mockResolvedValue({ changes: [{ taskId: "a" }] } as never);
});

describe("connect reschedule-preview route", () => {
  it("answers the auth response when the token is refused", async () => {
    jest.mocked(authenticateConnectorRequest).mockResolvedValue({
      response: Response.json({}, { status: 401 }),
    } as never);
    const res = await call({ action: "preview" });
    expect(res.status).toBe(401);
    expect(runReschedulePreviewAction).not.toHaveBeenCalled();
  });

  it("passes the body, user and workspace to the shared action", async () => {
    const body = { action: "preview", taskIds: ["a"] };
    const res = await call(body);
    expect(res.status).toBe(200);
    expect(runReschedulePreviewAction).toHaveBeenCalledWith(
      "u1",
      { workspaceId: "w1" },
      body
    );
    expect(sendConnectorWebhook).not.toHaveBeenCalled();
  });

  it("sends schedule.changed on apply and undo, not on preview", async () => {
    await call({ action: "apply", token: "t" });
    await call({ action: "undo", token: "t" });
    expect(sendConnectorWebhook).toHaveBeenCalledTimes(2);
    expect(sendConnectorWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", event: "schedule.changed" })
    );
  });

  it("still answers when the webhook fails", async () => {
    jest.mocked(sendConnectorWebhook).mockRejectedValueOnce(new Error("down"));
    const res = await call({ action: "apply", token: "t" });
    expect(res.status).toBe(200);
  });

  it("answers 409 for a stale token, 400 for a bad body, 429 over the limit", async () => {
    jest
      .mocked(runReschedulePreviewAction)
      .mockRejectedValueOnce(new SchedulePreviewConflictError());
    const stale = await call({ action: "apply", token: "t" });
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("SCHEDULE_PREVIEW_STALE");

    jest
      .mocked(runReschedulePreviewAction)
      .mockRejectedValueOnce(new Error("bad"));
    expect((await call({ action: "nope" })).status).toBe(400);

    limit.mockResolvedValueOnce(Response.json({}, { status: 429 }));
    expect((await call({ action: "preview" })).status).toBe(429);
  });
});
