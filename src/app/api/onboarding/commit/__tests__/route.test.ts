import { NextRequest } from "next/server";

import { seedFirstReplanDemoAfterStart } from "@/services/onboarding/sample-http";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { planBlocker } from "@/lib/onboarding/answers";
import { markOnboardingComplete } from "@/lib/onboarding/entry";
import { commitOnboarding, readSavedAnswers } from "@/lib/onboarding/server";

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  ipRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/onboarding/answers", () => ({
  ...jest.requireActual("@/lib/onboarding/answers"),
  planBlocker: jest.fn(),
}));
jest.mock("@/lib/onboarding/server", () => ({
  commitOnboarding: jest.fn(),
  readSavedAnswers: jest.fn(),
}));
jest.mock("@/lib/onboarding/entry", () => ({
  markOnboardingComplete: jest.fn(),
}));
jest.mock("@/services/onboarding/sample-http", () => ({
  seedFirstReplanDemoAfterStart: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const request = () =>
  new NextRequest("http://localhost/api/onboarding/commit", {
    method: "POST",
    body: JSON.stringify({ timeZone: "UTC" }),
  });

describe("POST /api/onboarding/commit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "u1",
      workspace: { id: "w1", workspaceId: "w1" },
    } as never);
    jest.mocked(readSavedAnswers).mockResolvedValue({} as never);
    jest.mocked(planBlocker).mockReturnValue(null);
  });

  it("records onboarding as finished once the week is written", async () => {
    jest.mocked(commitOnboarding).mockResolvedValue({ tasks: 3 } as never);
    const response = await POST(request());
    expect(response?.status).toBe(200);
    expect(markOnboardingComplete).toHaveBeenCalledWith("u1");
  });

  it("does not record it when writing the week fails", async () => {
    jest.mocked(commitOnboarding).mockRejectedValue(new Error("boom"));
    const response = await POST(request());
    expect(response?.status).toBe(500);
    expect(markOnboardingComplete).not.toHaveBeenCalled();
    expect(seedFirstReplanDemoAfterStart).not.toHaveBeenCalled();
  });

  it("seeds the first-replan demo after the week is placed", async () => {
    jest.mocked(commitOnboarding).mockResolvedValue({ tasks: 3 } as never);
    await POST(request());
    expect(seedFirstReplanDemoAfterStart).toHaveBeenCalledWith({
      userId: "u1",
      workspaceId: "w1",
      timeZone: "UTC",
    });
    expect(
      jest.mocked(seedFirstReplanDemoAfterStart).mock.invocationCallOrder[0]
    ).toBeGreaterThan(
      jest.mocked(commitOnboarding).mock.invocationCallOrder[0]
    );
  });
});
