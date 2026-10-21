import { NextRequest } from "next/server";

import {
  DESKTOP_CODE_TTL_MS,
  desktopChallengeFor,
  hashDesktopCode,
  isDesktopHandoffRequest,
  issueDesktopAuthCode,
  redeemDesktopAuthCode,
  sessionCookieName,
} from "@/lib/auth/desktop-handoff";
import { prisma } from "@/lib/prisma";

interface Row {
  codeHash: string;
  challenge: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

const rows: Row[] = [];
let userRow: Record<string, unknown> | null = null;

jest.mock("@/lib/prisma", () => ({
  prisma: {
    desktopAuthCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  },
}));

const codes = prisma.desktopAuthCode as unknown as Record<string, jest.Mock>;
const users = prisma.user as unknown as { findUnique: jest.Mock };

const VERIFIER = "v".repeat(43);
const CHALLENGE = desktopChallengeFor(VERIFIER);
const USER = {
  id: "user-1",
  name: "Ada",
  email: "ada@example.com",
  image: null,
  role: "user",
  isActive: true,
};

describe("desktop sign-in handoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    rows.length = 0;
    userRow = { ...USER };
    codes.create.mockImplementation(async ({ data }: { data: Row }) => {
      rows.push({ ...data, usedAt: null });
      return data;
    });
    codes.findUnique.mockImplementation(
      async ({ where }: { where: { codeHash: string } }) =>
        rows.find((r) => r.codeHash === where.codeHash) ?? null
    );
    codes.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: {
          codeHash: string;
          usedAt: null;
          expiresAt: { gt: Date };
        };
        data: { usedAt: Date };
      }) => {
        const hit = rows.filter(
          (r) =>
            r.codeHash === where.codeHash &&
            r.usedAt === null &&
            r.expiresAt > where.expiresAt.gt
        );
        hit.forEach((r) => (r.usedAt = data.usedAt));
        return { count: hit.length };
      }
    );
    codes.deleteMany.mockResolvedValue({ count: 0 });
    users.findUnique.mockImplementation(async () => userRow);
  });

  it("derives the challenge as base64url(sha256(verifier))", () => {
    expect(CHALLENGE).toHaveLength(43);
    expect(CHALLENGE).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(desktopChallengeFor(VERIFIER)).toBe(CHALLENGE);
    expect(desktopChallengeFor(VERIFIER + "x")).not.toBe(CHALLENGE);
  });

  it("stores only the hash of the code, with a 60 second life", async () => {
    const before = Date.now();
    const code = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toBe(hashDesktopCode(code));
    expect(JSON.stringify(rows[0])).not.toContain(code);
    expect(rows[0].userId).toBe("user-1");
    const life = rows[0].expiresAt.getTime() - before;
    expect(DESKTOP_CODE_TTL_MS).toBe(60_000);
    expect(life).toBeGreaterThanOrEqual(DESKTOP_CODE_TTL_MS - 50);
    expect(life).toBeLessThanOrEqual(DESKTOP_CODE_TTL_MS + 1_000);
  });

  it("issues a different code every time", async () => {
    const a = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    const b = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    expect(a).not.toBe(b);
  });

  it("refuses a challenge that is not a sha256 digest", async () => {
    await expect(
      issueDesktopAuthCode({ userId: "user-1", challenge: "short" })
    ).rejects.toThrow("Invalid challenge");
    expect(rows).toHaveLength(0);
  });

  it("redeems a code once, for the user it was issued to", async () => {
    const code = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    await expect(
      redeemDesktopAuthCode({ code, verifier: VERIFIER })
    ).resolves.toEqual({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      image: null,
      role: "user",
    });
    // A replay of the same code, with the right verifier, gets nothing.
    await expect(
      redeemDesktopAuthCode({ code, verifier: VERIFIER })
    ).resolves.toBeNull();
  });

  it("refuses a wrong verifier and burns the code", async () => {
    const code = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    await expect(
      redeemDesktopAuthCode({ code, verifier: "w".repeat(43) })
    ).resolves.toBeNull();
    await expect(
      redeemDesktopAuthCode({ code, verifier: VERIFIER })
    ).resolves.toBeNull();
  });

  it("refuses an expired code", async () => {
    const code = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    rows[0].expiresAt = new Date(Date.now() - 1);
    await expect(
      redeemDesktopAuthCode({ code, verifier: VERIFIER })
    ).resolves.toBeNull();
  });

  it("refuses an unknown code and malformed input without a query", async () => {
    await expect(
      redeemDesktopAuthCode({ code: "a".repeat(43), verifier: VERIFIER })
    ).resolves.toBeNull();
    await expect(
      redeemDesktopAuthCode({ code: "short", verifier: VERIFIER })
    ).resolves.toBeNull();
    await expect(
      redeemDesktopAuthCode({ code: "a".repeat(43), verifier: "x" })
    ).resolves.toBeNull();
    expect(codes.findUnique).toHaveBeenCalledTimes(1);
  });

  it("refuses a user who was deactivated after the code was issued", async () => {
    const code = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    userRow = { ...USER, isActive: false };
    await expect(
      redeemDesktopAuthCode({ code, verifier: VERIFIER })
    ).resolves.toBeNull();
  });

  it("lets only one of two simultaneous redemptions through", async () => {
    const code = await issueDesktopAuthCode({
      userId: "user-1",
      challenge: CHALLENGE,
    });
    const results = await Promise.all([
      redeemDesktopAuthCode({ code, verifier: VERIFIER }),
      redeemDesktopAuthCode({ code, verifier: VERIFIER }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  describe("isDesktopHandoffRequest", () => {
    const base = "https://use.needt.app/api/auth/desktop/exchange";
    const build = (headers: Record<string, string>) =>
      new NextRequest(base, { method: "POST", headers });
    const good = {
      "x-needt-desktop": "1",
      "content-type": "application/json",
      origin: "https://use.needt.app",
    };

    beforeEach(() => {
      delete process.env.NEXTAUTH_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
    });

    it("accepts a same-origin JSON post with the header", () => {
      expect(isDesktopHandoffRequest(build(good))).toBe(true);
    });

    it("refuses a missing header, a form post, or no Origin", () => {
      expect(
        isDesktopHandoffRequest(build({ ...good, "x-needt-desktop": "0" }))
      ).toBe(false);
      const noHeader: Record<string, string> = { ...good };
      delete noHeader["x-needt-desktop"];
      expect(isDesktopHandoffRequest(build(noHeader))).toBe(false);
      expect(
        isDesktopHandoffRequest(
          build({
            ...good,
            "content-type": "application/x-www-form-urlencoded",
          })
        )
      ).toBe(false);
      const noOrigin: Record<string, string> = { ...good };
      delete noOrigin.origin;
      expect(isDesktopHandoffRequest(build(noOrigin))).toBe(false);
    });

    it("refuses another site's Origin", () => {
      expect(
        isDesktopHandoffRequest(
          build({ ...good, origin: "https://evil.example" })
        )
      ).toBe(false);
      expect(
        isDesktopHandoffRequest(
          build({ ...good, origin: "https://use.needt.app.evil.example" })
        )
      ).toBe(false);
    });
  });

  describe("sessionCookieName", () => {
    it("follows NextAuth: secure prefix on https only", () => {
      expect(
        sessionCookieName({ NEXTAUTH_URL: "https://use.needt.app" } as never)
      ).toBe("__Secure-next-auth.session-token");
      expect(
        sessionCookieName({ NEXTAUTH_URL: "http://localhost:3000" } as never)
      ).toBe("next-auth.session-token");
    });
  });
});
