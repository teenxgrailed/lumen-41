import { NextRequest } from "next/server";

import { DELETE } from "@/app/api/accounts/route";

import { revokeGoogleConnectionOnDisconnect } from "@/services/account/account-external-access";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/account/account-external-access", () => ({
  revokeGoogleConnectionOnDisconnect: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectedAccount: { findUnique: jest.fn(), delete: jest.fn() },
    calendarFeed: { updateMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  connectedAccount: { findUnique: jest.Mock; delete: jest.Mock };
  calendarFeed: { updateMany: jest.Mock };
};

function request() {
  return new NextRequest("http://localhost/api/accounts", {
    method: "DELETE",
    body: JSON.stringify({ accountId: "acct-1" }),
  });
}

describe("DELETE /api/accounts", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
    db.connectedAccount.findUnique.mockResolvedValue({ id: "acct-1" });
    db.connectedAccount.delete.mockResolvedValue({});
    db.calendarFeed.updateMany.mockResolvedValue({ count: 1 });
  });

  it("revokes and stops channels before the tokens are deleted", async () => {
    const order: string[] = [];
    (revokeGoogleConnectionOnDisconnect as jest.Mock).mockImplementation(
      async () => {
        order.push("revoke");
      }
    );
    db.connectedAccount.delete.mockImplementation(async () => {
      order.push("delete");
    });

    const res = await DELETE(request());

    expect(res?.status).toBe(200);
    expect(revokeGoogleConnectionOnDisconnect).toHaveBeenCalledWith(
      "u1",
      "acct-1",
      { stopWebhooks: true }
    );
    expect(order).toEqual(["revoke", "delete"]);
  });

  it("still disconnects when the revoke helper rejects", async () => {
    (revokeGoogleConnectionOnDisconnect as jest.Mock).mockRejectedValue(
      new Error("boom")
    );
    const res = await DELETE(request());
    expect(res?.status).toBe(200);
    expect(db.connectedAccount.delete).toHaveBeenCalled();
  });
});
