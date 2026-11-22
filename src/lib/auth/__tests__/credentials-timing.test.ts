import { compare, hash } from "bcryptjs";

import {
  authenticateUser,
  getDummyHash,
} from "@/lib/auth/credentials-provider";
import { prisma } from "@/lib/prisma";

jest.mock("bcryptjs", () => ({ compare: jest.fn(), hash: jest.fn() }));
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
  jest.mocked(hash).mockResolvedValue("fake-dummy" as never);
});

describe("authenticateUser timing", () => {
  it("builds the dummy hash once, at cost 12", async () => {
    const first = await getDummyHash();
    await getDummyHash();
    expect(first).toBe("fake-dummy");
    expect(hash).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledWith(expect.any(String), 12);
  });

  it("compares once against the dummy hash for an unknown email", async () => {
    find(null);
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", "fake-dummy");
  });

  it("compares once for an inactive user", async () => {
    find({ id: "u", isActive: false, accounts: account("real") });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", "fake-dummy");
  });

  it("compares once for a user with no credentials account", async () => {
    find({ id: "u", isActive: true, accounts: [] });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", "fake-dummy");
  });

  it("compares once for a passwordless account", async () => {
    find({ id: "u", isActive: true, accounts: account(null) });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", "fake-dummy");
  });

  it("compares once against the real hash for a wrong password", async () => {
    find({ id: "u", isActive: true, accounts: account("real") });
    expect(await authenticateUser("a@x.test", "pw")).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("pw", "real");
  });
});
