import { getAuthOptions } from "@/lib/auth/auth-options";
import {
  SESSION_VERSION_RECHECK_MS,
  SessionRevokedError,
  enforceSessionVersion,
  forgetSessionState,
  isApiSessionCurrent,
} from "@/lib/auth/session-version";
import { prisma } from "@/lib/prisma";

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));
jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: jest.fn().mockResolvedValue({}),
  getOutlookCredentials: jest.fn().mockResolvedValue({}),
}));
jest.mock("@/lib/trials/trial-service", () => ({
  markEmailVerifiedAndStartTrial: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

const findUnique = prisma.user.findUnique as unknown as jest.Mock;
const NOW = 1_800_000_000_000;

async function jwtCallback() {
  const options = await getAuthOptions();
  const jwt = options.callbacks?.jwt;
  if (!jwt) throw new Error("jwt callback missing");
  return (args: Record<string, unknown>) => jwt(args as never);
}

describe("session version", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetSessionState("user-1");
  });

  it("signs a token out once the database version moved on", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 2 });

    await expect(
      enforceSessionVersion({ sub: "user-1", sessionVersion: 1 }, NOW)
    ).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it("keeps a token whose version matches and stamps the check time", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 3 });

    const token = await enforceSessionVersion(
      { sub: "user-1", sessionVersion: 3 },
      NOW
    );

    expect(token).toMatchObject({
      sub: "user-1",
      sessionVersion: 3,
      sessionVersionCheckedAt: NOW,
    });
  });

  it("treats a token from before versioning as version 0", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 0 });

    await expect(
      enforceSessionVersion({ sub: "user-1" }, NOW)
    ).resolves.toMatchObject({ sessionVersion: 0 });
  });

  it("signs out a deleted or disabled user", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(
      enforceSessionVersion({ sub: "user-1" }, NOW)
    ).rejects.toBeInstanceOf(SessionRevokedError);

    findUnique.mockResolvedValueOnce({ isActive: false, sessionVersion: 0 });
    await expect(
      enforceSessionVersion({ sub: "user-1" }, NOW)
    ).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it("reads the database at most once per recheck interval", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 5 });
    const checkedAt = NOW - SESSION_VERSION_RECHECK_MS + 1;

    const fresh = await enforceSessionVersion(
      { sub: "user-1", sessionVersion: 4, sessionVersionCheckedAt: checkedAt },
      NOW
    );
    expect(fresh.sessionVersionCheckedAt).toBe(checkedAt);
    expect(findUnique).not.toHaveBeenCalled();

    await expect(
      enforceSessionVersion(
        {
          sub: "user-1",
          sessionVersion: 4,
          sessionVersionCheckedAt: NOW - SESSION_VERSION_RECHECK_MS,
        },
        NOW
      )
    ).rejects.toBeInstanceOf(SessionRevokedError);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("does not trust a check time from the future", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 1 });

    await expect(
      enforceSessionVersion(
        { sub: "user-1", sessionVersion: 0, sessionVersionCheckedAt: NOW + 1 },
        NOW
      )
    ).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it("caches the API check per process for the recheck interval", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 0 });

    await expect(isApiSessionCurrent({ sub: "user-1" }, NOW)).resolves.toBe(
      true
    );
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 1 });
    await expect(
      isApiSessionCurrent(
        { sub: "user-1" },
        NOW + SESSION_VERSION_RECHECK_MS - 1
      )
    ).resolves.toBe(true);
    await expect(
      isApiSessionCurrent({ sub: "user-1" }, NOW + SESSION_VERSION_RECHECK_MS)
    ).resolves.toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("keeps the token unchanged when the database read fails", async () => {
    findUnique.mockRejectedValue(
      Object.assign(new Error("Timed out fetching a new connection"), {
        code: "P2024",
      })
    );
    const token = {
      sub: "user-1",
      sessionVersion: 4,
      sessionVersionCheckedAt: NOW - SESSION_VERSION_RECHECK_MS,
    };

    await expect(enforceSessionVersion(token, NOW)).resolves.toBe(token);

    // The check time was not moved, so the next request checks again.
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 5 });
    await expect(enforceSessionVersion(token, NOW + 1)).rejects.toBeInstanceOf(
      SessionRevokedError
    );
  });

  it("lets an API request through when the database read fails, uncached", async () => {
    findUnique.mockRejectedValueOnce(new Error("Connection refused"));
    await expect(isApiSessionCurrent({ sub: "user-1" }, NOW)).resolves.toBe(
      true
    );

    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 1 });
    await expect(isApiSessionCurrent({ sub: "user-1" }, NOW + 1)).resolves.toBe(
      false
    );
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("never refuses a new sign-in from a cache filled by the old one", async () => {
    // This instance cached the old session's state...
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 0 });
    await isApiSessionCurrent({ sub: "user-1", sessionVersion: 0 }, NOW);

    // ...then another instance revoked and the person signed in again.
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 1 });
    await expect(
      isApiSessionCurrent({ sub: "user-1", sessionVersion: 1 }, NOW + 1)
    ).resolves.toBe(true);
  });

  it("does not cache a refusal", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 2 });

    await isApiSessionCurrent({ sub: "user-1", sessionVersion: 1 }, NOW);
    await isApiSessionCurrent({ sub: "user-1", sessionVersion: 1 }, NOW + 1);

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("re-reads at once after this process revoked the user", async () => {
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 0 });
    await isApiSessionCurrent({ sub: "user-1" }, NOW);

    forgetSessionState("user-1");
    findUnique.mockResolvedValue({ isActive: true, sessionVersion: 1 });

    await expect(isApiSessionCurrent({ sub: "user-1" }, NOW)).resolves.toBe(
      false
    );
  });

  describe("jwt callback", () => {
    it("stamps the current version at sign-in", async () => {
      findUnique.mockResolvedValue({ isActive: true, sessionVersion: 7 });
      const jwt = await jwtCallback();

      const token = await jwt({
        token: {},
        user: { id: "user-1", role: "user" },
        trigger: "signIn",
      });

      expect(token).toMatchObject({ sub: "user-1", sessionVersion: 7 });
      expect(typeof token.sessionVersionCheckedAt).toBe("number");
    });

    it("throws on a revoked token so NextAuth clears the session", async () => {
      findUnique.mockResolvedValue({ isActive: true, sessionVersion: 8 });
      const jwt = await jwtCallback();

      await expect(
        jwt({ token: { sub: "user-1", sessionVersion: 7 } })
      ).rejects.toBeInstanceOf(SessionRevokedError);
    });

    it("keeps a current token", async () => {
      findUnique.mockResolvedValue({ isActive: true, sessionVersion: 8 });
      const jwt = await jwtCallback();

      await expect(
        jwt({ token: { sub: "user-1", sessionVersion: 8, role: "user" } })
      ).resolves.toMatchObject({ sub: "user-1", role: "user" });
    });
  });

  it("configures a 30-day session for both the cookie and the token", async () => {
    const options = await getAuthOptions();

    expect(options.session?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(options.jwt?.maxAge).toBe(30 * 24 * 60 * 60);
  });
});
