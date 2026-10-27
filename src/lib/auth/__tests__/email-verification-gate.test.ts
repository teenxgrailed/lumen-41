import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  },
}));

const user = prisma.user.findUnique as jest.Mock;
const settings = prisma.systemSettings.findFirst as jest.Mock;

describe("the verification gate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is on when there is no settings row at all", async () => {
    user.mockResolvedValue({ email: "a@example.com", emailVerified: null });
    settings.mockResolvedValue(null);
    await expect(getEmailVerificationStatus("u1")).resolves.toEqual({
      email: "a@example.com",
      verified: false,
      required: true,
    });
  });

  it("lets a confirmed (or grandfathered) account through", async () => {
    user.mockResolvedValue({
      email: "a@example.com",
      emailVerified: new Date("2026-01-01T00:00:00Z"),
    });
    settings.mockResolvedValue({ requireEmailVerificationBeforeAccess: true });
    const status = await getEmailVerificationStatus("u1");
    expect(status.verified).toBe(true);
  });

  it("keeps the admin kill switch", async () => {
    user.mockResolvedValue({ email: "a@example.com", emailVerified: null });
    settings.mockResolvedValue({ requireEmailVerificationBeforeAccess: false });
    expect((await getEmailVerificationStatus("u1")).required).toBe(false);
  });
});
