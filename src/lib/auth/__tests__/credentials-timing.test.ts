import { compare } from "bcryptjs";

import { DUMMY_HASH, authenticateUser } from "@/lib/auth/credentials-provider";
import { prisma } from "@/lib/prisma";

jest.mock("bcryptjs", () => ({ compare: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/auth/public-signup", () => ({
  isPublicSignupEnabled: jest.fn(),
}));

const account = (id_token: string | null) => [
  { provider: "credentials", id_token },
];
const find = (user: unknown) =>
  jest.mocked(prisma.user.findUnique).mockResolvedValue(user as never);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(compare).mockResolvedValue(false as never);
});

describe("authenticateUser timing", () => {
  it("DUMMY_HASH is a cost-12 bcrypt hash", () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
  });

  it("compares once against the dummy hash for an unknown email", async () => {
    find(null);
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", DUMMY_HASH);
  });

  it("compares once for an inactive user", async () => {
    find({ id: "u", isActive: false, accounts: account("real") });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", DUMMY_HASH);
  });

  it("compares once for a user with no credentials account", async () => {
    find({ id: "u", isActive: true, accounts: [] });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", DUMMY_HASH);
  });

  it("compares once for a passwordless account", async () => {
    find({ id: "u", isActive: true, accounts: account(null) });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", DUMMY_HASH);
  });

  it("compares once against the real hash for a wrong password", async () => {
    find({ id: "u", isActive: true, accounts: account("real") });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", "real");
  });
});
