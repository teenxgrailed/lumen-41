import { NextRequest } from "next/server";

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
      workspace: { id: "w1" },
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
  });
});
