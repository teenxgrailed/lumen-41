import { createOAuthMailAccount, pauseMailAccountSync } from "@/lib/mail-db";
import { syncGmail } from "@/lib/mail/providers";
import { syncMailAccount } from "@/lib/mail/sync";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    mailAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));
jest.mock("@/lib/mail/providers", () => ({
  syncGmail: jest.fn(),
  syncImap: jest.fn(),
  syncOutlookMail: jest.fn(),
}));

const model = prisma.mailAccount as unknown as {
  findUnique: jest.Mock;
  update: jest.Mock;
  upsert: jest.Mock;
};

beforeEach(() => jest.clearAllMocks());

describe("paused mail accounts", () => {
  it("pausing flags the account as ERROR with a short code", async () => {
    await pauseMailAccountSync("acc1", "auth");
    expect(model.update).toHaveBeenCalledWith({
      where: { id: "acc1" },
      data: expect.objectContaining({
        status: "ERROR",
        syncError: "auth",
        syncPausedAt: expect.any(Date),
      }),
    });
  });

  it("a paused account is not synced, even by a leftover repeat job", async () => {
    model.findUnique.mockResolvedValue({
      id: "acc1",
      provider: "GMAIL",
      status: "ERROR",
      syncPausedAt: new Date(),
    });
    await syncMailAccount("acc1");
    expect(syncGmail).not.toHaveBeenCalled();
  });

  it("reconnecting clears the pause so sync runs again", async () => {
    await createOAuthMailAccount({
      userId: "u1",
      provider: "GMAIL",
      address: "a@b.co",
      connectionRef: "conn1",
    });
    expect(model.upsert.mock.calls[0][0].update).toMatchObject({
      status: "ACTIVE",
      syncPausedAt: null,
      syncError: null,
    });
  });
});
