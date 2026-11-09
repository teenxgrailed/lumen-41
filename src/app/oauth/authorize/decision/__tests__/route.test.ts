import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";

import { validateAuthorizationRequest } from "@/services/oauth/authorize";
import { createAuthorizationCode } from "@/services/oauth/grants";

import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";

import { POST } from "../route";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn().mockResolvedValue({}),
}));
jest.mock("@/lib/auth/admin-role", () => ({ isAdminUserId: jest.fn() }));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest.fn(),
}));
jest.mock("@/lib/public-url", () => ({
  publicAppUrl: () => new URL("https://app.example.test/"),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  requestIp: () => "203.0.113.9",
}));
jest.mock("@/services/oauth/limits", () => ({
  DECISION_LIMIT_PER_MINUTE: 10,
  cimdFetchGuard: jest.fn(),
  limitAuthorize: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/services/oauth/authorize", () => ({
  clientRedirect: jest.fn(),
  completeFirstPartyAuthorization: jest.fn(),
  mcpScopesOf: jest.fn(),
  validateAuthorizationRequest: jest.fn(),
}));
jest.mock("@/services/oauth/consent", () => ({
  AUTHORIZE_PARAMS: ["client_id"],
  consentWorkspaces: jest.fn(),
  grantedScopes: jest.fn(),
}));
jest.mock("@/services/oauth/grants", () => ({
  createAuthorizationCode: jest.fn(),
}));

function allowRequest() {
  const body = new URLSearchParams({ client_id: "c", decision: "allow" });
  return new NextRequest("https://app.example.test/oauth/authorize/decision", {
    method: "POST",
    headers: {
      origin: "https://app.example.test",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}

describe("POST /oauth/authorize/decision email gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(getServerSession)
      .mockResolvedValue({ user: { id: "u1" } } as never);
  });

  it("refuses an unverified account before anything is validated or issued", async () => {
    jest.mocked(getEmailVerificationStatus).mockResolvedValue({
      email: "a@example.test",
      verified: false,
      required: true,
    });
    const response = await POST(allowRequest());
    expect(response.status).toBe(403);
    expect(validateAuthorizationRequest).not.toHaveBeenCalled();
    expect(createAuthorizationCode).not.toHaveBeenCalled();
  });

  it("goes on to validate when the address is verified", async () => {
    jest.mocked(getEmailVerificationStatus).mockResolvedValue({
      email: "a@example.test",
      verified: true,
      required: true,
    });
    jest.mocked(validateAuthorizationRequest).mockResolvedValue({
      ok: false,
      kind: "page",
      description: "stop here",
    } as never);
    const response = await POST(allowRequest());
    expect(validateAuthorizationRequest).toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
