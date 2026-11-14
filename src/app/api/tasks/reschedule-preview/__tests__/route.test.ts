import { NextRequest } from "next/server";

import {
  applyReschedulePreview,
  createReschedulePreview,
  undoReschedulePreview,
} from "@/services/ai/reschedule-preview";

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({
    userId: "u1",
    workspace: { workspaceId: "w1" },
  }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/ai/reschedule-preview", () => ({
  SchedulePreviewConflictError: class extends Error {},
  createReschedulePreview: jest.fn().mockResolvedValue({}),
  applyReschedulePreview: jest.fn().mockResolvedValue({}),
  undoReschedulePreview: jest.fn().mockResolvedValue({}),
}));

function call(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/tasks/reschedule-preview", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => jest.clearAllMocks());

describe("reschedule-preview route: via", () => {
  it("defaults to the chat card", async () => {
    await call({ action: "preview" });
    await call({ action: "apply", token: "t" });
    await call({ action: "undo", token: "t" });
    expect(createReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      { via: "chat" }
    );
    expect(applyReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "chat" }
    );
    expect(undoReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "chat" }
    );
  });

  it("passes via fill through so Fill it is not counted as Keep", async () => {
    await call({ action: "preview", via: "fill" });
    await call({ action: "apply", token: "t", via: "fill" });
    expect(createReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      { via: "fill" }
    );
    expect(applyReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "fill" }
    );
  });
});
