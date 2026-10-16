import { NextRequest } from "next/server";

import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/google", () => ({ createGoogleOAuthClient: jest.fn() }));
jest.mock("googleapis", () => ({ google: {} }));
jest.mock("@/lib/entitlements", () => ({ canAddMailbox: jest.fn() }));
jest.mock("@/lib/mail-db", () => ({ createOAuthMailAccount: jest.fn() }));
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueMailSync: jest.fn(),
  ensureMailSyncSchedule: jest.fn(),
}));
jest.mock("@/lib/token-manager", () => ({
  TokenManager: { getInstance: jest.fn() },
}));

describe("google mail OAuth callback redirect", () => {
  const original = process.env.NEXTAUTH_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = original;
  });

  it("redirects to NEXTAUTH_URL, not the container address", async () => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    const res = await GET(
      new NextRequest("http://0.0.0.0:3000/api/mail/oauth/google/callback")
    );
    expect(res?.headers.get("location")).toBe(
      "https://use.needt.app/mail?error=google"
    );
  });
});
