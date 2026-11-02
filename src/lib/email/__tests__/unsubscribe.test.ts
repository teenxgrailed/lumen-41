import {
  applyUnsubscribe,
  signUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    notificationSettings: { updateMany: jest.fn() },
    emailPreference: { upsert: jest.fn() },
  },
}));

describe("unsubscribe tokens", () => {
  it("round-trips the user and the category", () => {
    const token = signUnsubscribeToken("user-1", "product");
    expect(verifyUnsubscribeToken(token)).toEqual({
      userId: "user-1",
      category: "product",
    });
  });

  it("rejects a tampered, foreign or empty token", () => {
    const token = signUnsubscribeToken("user-1", "product");
    const [payload, sig] = token.split(".");
    const other = signUnsubscribeToken("user-2", "product").split(".")[0];
    expect(verifyUnsubscribeToken(`${other}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.forged`)).toBeNull();
    expect(verifyUnsubscribeToken(payload)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
  });

  it("builds an absolute link on the app origin", () => {
    const url = new URL(unsubscribeUrl("user-1", "digest"));
    expect(url.pathname).toBe("/api/email/unsubscribe");
    expect(verifyUnsubscribeToken(url.searchParams.get("t"))).toEqual({
      userId: "user-1",
      category: "digest",
    });
  });
});

describe("new categories in tokens", () => {
  it.each(["tips", "offers", "updates", "recap", "all"] as const)(
    "%s round-trips",
    (category) => {
      expect(
        verifyUnsubscribeToken(signUnsubscribeToken("u1", category))
      ).toEqual({ userId: "u1", category });
    }
  );
});

describe("applyUnsubscribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u" } as never);
  });

  it("product: records the opt-out on the user", async () => {
    await expect(applyUnsubscribe("u", "product")).resolves.toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u", commercialEmailsOptOutAt: null },
      data: { commercialEmailsOptOutAt: expect.any(Date) },
    });
  });

  it("product (old links): also switches tips, offers and updates off", async () => {
    await applyUnsubscribe("u", "product");
    const categories = jest
      .mocked(prisma.emailPreference.upsert)
      .mock.calls.map((call) => call[0].create.category)
      .sort();
    expect(categories).toEqual(["offers", "tips", "updates"]);
  });

  it("one category: switches only that category off, source unsubscribe-link", async () => {
    await applyUnsubscribe("u", "offers");
    expect(prisma.emailPreference.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.emailPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: "u",
          category: "offers",
          enabled: false,
          source: "unsubscribe-link",
        },
      })
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificationSettings.updateMany).not.toHaveBeenCalled();
  });

  it("all: switches every optional category off and leaves the digest", async () => {
    await applyUnsubscribe("u", "all");
    const categories = jest
      .mocked(prisma.emailPreference.upsert)
      .mock.calls.map((call) => call[0].create.category)
      .sort();
    expect(categories).toEqual(["offers", "recap", "tips", "updates"]);
    expect(prisma.notificationSettings.updateMany).not.toHaveBeenCalled();
  });

  it("digest: turns the daily digest off", async () => {
    await expect(applyUnsubscribe("u", "digest")).resolves.toBe(true);
    expect(prisma.notificationSettings.updateMany).toHaveBeenCalledWith({
      where: { userId: "u" },
      data: { digest: false },
    });
  });

  it("an unknown account changes nothing", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(applyUnsubscribe("gone", "product")).resolves.toBe(false);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
