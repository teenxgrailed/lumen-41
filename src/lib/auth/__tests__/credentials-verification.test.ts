import { compare } from "bcryptjs";

import { authenticateUser } from "@/lib/auth/credentials-provider";
import { prisma } from "@/lib/prisma";

jest.mock("bcryptjs", () => ({ compare: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  },
}));

const unverifiedUser = {
  id: "user-1",
  email: "person@example.com",
  emailVerified: null,
  isActive: true,
  role: "user",
  accounts: [
    {
      provider: "credentials",
      id_token: "password-hash",
    },
  ],
};

describe("credentials sign-in and email confirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue(unverifiedUser as never);
    jest.mocked(compare).mockResolvedValue(true as never);
  });

  it.each([true, false])(
    "signs an unconfirmed account in (flag %s): the app and API gate it, not the session",
    async (required) => {
      jest.mocked(prisma.systemSettings.findFirst).mockResolvedValue({
        requireEmailVerificationBeforeAccess: required,
      } as never);
      await expect(
        authenticateUser(" Person@Example.com ", "password")
      ).resolves.toMatchObject({ id: "user-1" });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: "person@example.com" } })
      );
    }
  );
});
