import { NextRequest } from "next/server";

import { DELETE } from "@/app/api/mail/accounts/[id]/route";

import { revokeGoogleConnectionOnDisconnect } from "@/services/account/account-external-access";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { removeMailSyncSchedule } from "@/lib/queue/enqueue";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/queue/enqueue", () => ({
  removeMailSyncSchedule: jest.fn(),
}));
jest.mock("@/services/account/account-external-access", () => ({
  revokeGoogleConnectionOnDisconnect: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    mailAccount: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
    calendarFeed: { count: jest.fn() },
    taskProvider: { count: jest.fn() },
    connectedAccount: { deleteMany: jest.fn() },
    mailMessage: { deleteMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  mailAccount: { findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
  calendarFeed: { count: jest.Mock };
  taskProvider: { count: jest.Mock };
  connectedAccount: { deleteMany: jest.Mock };
  mailMessage: { deleteMany: jest.Mock };
};

const call = () =>
  DELETE(
    new NextRequest("http://localhost/api/mail/accounts/mail-1", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: "mail-1" }) }
  );

describe("DELETE /api/mail/accounts/[id]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
    db.mailAccount.findFirst.mockResolvedValue({
      id: "mail-1",
      provider: "GMAIL",
      connectionRef: "conn-1",
    });
    db.mailAccount.update.mockResolvedValue({});
    db.mailAccount.count.mockResolvedValue(0);
    db.calendarFeed.count.mockResolvedValue(0);
    db.taskProvider.count.mockResolvedValue(0);
    db.connectedAccount.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("revokes the Google token, then removes credentials and tokens but keeps messages", async () => {
    const order: string[] = [];
    (revokeGoogleConnectionOnDisconnect as jest.Mock).mockImplementation(
      async () => {
        order.push("revoke");
      }
    );
    db.mailAccount.update.mockImplementation(async () => {
      order.push("update");
    });
    db.connectedAccount.deleteMany.mockImplementation(async () => {
      order.push("delete");
      return { count: 1 };
    });

    const res = await call();

    expect(res.status).toBe(204);
    expect(revokeGoogleConnectionOnDisconnect).toHaveBeenCalledWith(
      "u1",
      "conn-1"
    );
    expect(db.mailAccount.update).toHaveBeenCalledWith({
      where: { id: "mail-1" },
      data: {
        status: "DISCONNECTED",
        encryptedCredentials: null,
        connectionRef: null,
      },
    });
    expect(db.connectedAccount.deleteMany).toHaveBeenCalledWith({
      where: { id: "conn-1", userId: "u1" },
    });
    expect(order).toEqual(["revoke", "update", "delete"]);
    expect(db.mailMessage.deleteMany).not.toHaveBeenCalled();
    expect(removeMailSyncSchedule).toHaveBeenCalledWith("mail-1");
  });

  it("neither revokes nor deletes a connection a calendar still uses", async () => {
    db.calendarFeed.count.mockResolvedValue(2);

    const res = await call();

    expect(res.status).toBe(204);
    expect(revokeGoogleConnectionOnDisconnect).not.toHaveBeenCalled();
    expect(db.connectedAccount.deleteMany).not.toHaveBeenCalled();
    expect(db.mailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ encryptedCredentials: null }),
      })
    );
  });

  it("does not revoke at Google for an IMAP mailbox but clears its credentials", async () => {
    db.mailAccount.findFirst.mockResolvedValue({
      id: "mail-1",
      provider: "IMAP",
      connectionRef: null,
    });

    const res = await call();

    expect(res.status).toBe(204);
    expect(revokeGoogleConnectionOnDisconnect).not.toHaveBeenCalled();
    expect(db.mailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ encryptedCredentials: null }),
      })
    );
  });

  it("answers 404 for a mailbox that is not the caller's", async () => {
    db.mailAccount.findFirst.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(revokeGoogleConnectionOnDisconnect).not.toHaveBeenCalled();
  });
});
