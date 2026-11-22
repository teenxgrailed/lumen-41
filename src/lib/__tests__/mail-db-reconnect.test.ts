import { revokeGoogleConnectionOnDisconnect } from "@/services/account/account-external-access";

import { createOAuthMailAccount } from "@/lib/mail-db";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/account/account-external-access", () => ({
  revokeGoogleConnectionOnDisconnect: jest.fn(async () => ({})),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    mailAccount: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    calendarFeed: { count: jest.fn() },
    taskProvider: { count: jest.fn() },
    connectedAccount: { deleteMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  mailAccount: Record<"findUnique" | "upsert" | "count", jest.Mock>;
  calendarFeed: { count: jest.Mock };
  taskProvider: { count: jest.Mock };
  connectedAccount: { deleteMany: jest.Mock };
};

const options = {
  userId: "u1",
  provider: "GMAIL" as const,
  address: "me@gmail.com",
  connectionRef: "new-mail-row",
};

describe("reconnecting a Gmail mailbox retires the replaced connection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.mailAccount.upsert.mockResolvedValue({ id: "mail-1" });
    db.mailAccount.count.mockResolvedValue(0);
    db.calendarFeed.count.mockResolvedValue(0);
    db.taskProvider.count.mockResolvedValue(0);
    db.connectedAccount.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("revokes and deletes the old row when nothing else uses it", async () => {
    db.mailAccount.findUnique.mockResolvedValue({ connectionRef: "old-main" });

    await createOAuthMailAccount(options);

    expect(revokeGoogleConnectionOnDisconnect).toHaveBeenCalledWith(
      "u1",
      "old-main"
    );
    expect(db.connectedAccount.deleteMany).toHaveBeenCalledWith({
      where: { id: "old-main", userId: "u1" },
    });
  });

  it("keeps the old row while a calendar feed still uses it", async () => {
    db.mailAccount.findUnique.mockResolvedValue({ connectionRef: "old-main" });
    db.calendarFeed.count.mockResolvedValue(1);

    await createOAuthMailAccount(options);

    expect(revokeGoogleConnectionOnDisconnect).not.toHaveBeenCalled();
    expect(db.connectedAccount.deleteMany).not.toHaveBeenCalled();
  });

  it("does nothing when the connection did not change", async () => {
    db.mailAccount.findUnique.mockResolvedValue({
      connectionRef: "new-mail-row",
    });

    await createOAuthMailAccount(options);

    expect(revokeGoogleConnectionOnDisconnect).not.toHaveBeenCalled();
    expect(db.connectedAccount.deleteMany).not.toHaveBeenCalled();
  });

  it("does nothing for a first connect", async () => {
    db.mailAccount.findUnique.mockResolvedValue(null);

    await createOAuthMailAccount(options);

    expect(db.connectedAccount.deleteMany).not.toHaveBeenCalled();
  });
});
