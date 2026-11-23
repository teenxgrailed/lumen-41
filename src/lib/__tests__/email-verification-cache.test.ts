import {
  EMAIL_VERIFICATION_SETTING_TTL_MS,
  getEmailVerificationStatus,
  requiresEmailVerificationBeforeAccess,
} from "@/lib/auth/email-verification-access";
import { prisma } from "@/lib/prisma";
import { clearTtlCaches, setTtlCachesEnabled } from "@/lib/ttl-cache";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  },
}));

const findUser = prisma.user.findUnique as jest.Mock;
const findSettings = prisma.systemSettings.findFirst as jest.Mock;

describe("email verification status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTtlCachesEnabled(true);
    findSettings.mockResolvedValue({
      requireEmailVerificationBeforeAccess: true,
    });
  });
  afterEach(() => setTtlCachesEnabled(false));

  it("keeps the setting for a short time but reads the person every call", async () => {
    findUser.mockResolvedValue({ email: "a@b.c", emailVerified: null });
    expect(await getEmailVerificationStatus("u1")).toMatchObject({
      required: true,
      verified: false,
    });
    findUser.mockResolvedValue({ email: "a@b.c", emailVerified: new Date() });
    expect(await getEmailVerificationStatus("u1")).toMatchObject({
      verified: true,
    });
    expect(findUser).toHaveBeenCalledTimes(2);
    expect(findSettings).toHaveBeenCalledTimes(1);
  });

  it("is a security setting, so its TTL is at most 15 s", () => {
    expect(EMAIL_VERIFICATION_SETTING_TTL_MS).toBeLessThanOrEqual(15_000);
  });

  it("shows a changed setting once the settings route clears the cache", async () => {
    findUser.mockResolvedValue({ email: "a@b.c", emailVerified: null });
    expect((await getEmailVerificationStatus("u1")).required).toBe(true);
    findSettings.mockResolvedValue({
      requireEmailVerificationBeforeAccess: false,
    });
    clearTtlCaches("system-settings");
    expect((await getEmailVerificationStatus("u1")).required).toBe(false);
  });

  it("the admin gate reads the setting fresh every time", async () => {
    findUser.mockResolvedValue({ email: "a@b.c", emailVerified: null });
    await getEmailVerificationStatus("u1"); // warms the cache
    findSettings.mockClear();
    findSettings.mockResolvedValue({
      requireEmailVerificationBeforeAccess: false,
    });
    expect(await requiresEmailVerificationBeforeAccess()).toBe(false);
    expect(await requiresEmailVerificationBeforeAccess()).toBe(false);
    expect(findSettings).toHaveBeenCalledTimes(2);
  });
});
