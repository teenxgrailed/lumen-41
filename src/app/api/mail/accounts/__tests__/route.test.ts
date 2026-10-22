import { NextRequest } from "next/server";

import {
  UnsafeFetchError,
  assertPublicHost,
} from "@/services/oauth/safe-fetch";
import { ImapFlow } from "imapflow";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { canAddMailbox } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import { POST as rawPost } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({ canAddMailbox: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/mail-db", () => ({ listMailAccounts: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { mailAccount: { upsert: jest.fn() } },
}));
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueMailSync: jest.fn(),
  ensureMailSyncSchedule: jest.fn(),
}));
jest.mock("@/services/ai/encryption", () => ({
  encryptSecret: jest.fn(() => "encrypted"),
}));
jest.mock("imapflow", () => ({ ImapFlow: jest.fn() }));
jest.mock("@/services/oauth/safe-fetch", () => ({
  ...jest.requireActual("@/services/oauth/safe-fetch"),
  assertPublicHost: jest.fn(),
}));

const POST = async (body: unknown) => {
  const response = await rawPost(
    new NextRequest("http://localhost/api/mail/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!response) throw new Error("Expected a route response.");
  return response;
};

const imap = jest.mocked(ImapFlow);
const guardHost = jest.mocked(assertPublicHost);
const connect = jest.fn();

const account = {
  address: "me@example.com",
  host: "imap.example.com",
  port: 993,
  secure: true,
  username: "me",
  password: "secret",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1" } as never);
  jest.mocked(canAddMailbox).mockResolvedValue({ allowed: true } as never);
  guardHost.mockResolvedValue(undefined);
  connect.mockResolvedValue(undefined);
  imap.mockImplementation(
    () => ({ connect, logout: jest.fn() }) as unknown as ImapFlow
  );
  jest
    .mocked(prisma.mailAccount.upsert)
    .mockResolvedValue({ id: "acc-1", address: account.address } as never);
});

describe("POST /api/mail/accounts", () => {
  it("connects to a public IMAP host exactly as given", async () => {
    const response = await POST({ ...account, port: 143, secure: false });

    expect(guardHost).toHaveBeenCalledWith("imap.example.com");
    expect(imap).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "imap.example.com",
        port: 143,
        secure: false,
      })
    );
    expect(response.status).toBe(201);
  });

  it("refuses a host on the internal network before any connection", async () => {
    guardHost.mockRejectedValue(
      new UnsafeFetchError("The host resolves to a non-public address.")
    );

    const response = await POST({ ...account, host: "10.0.0.5", port: 143 });

    expect(response.status).toBe(400);
    expect(imap).not.toHaveBeenCalled();
    expect(prisma.mailAccount.upsert).not.toHaveBeenCalled();
  });

  it("answers a refused host like a failed connection, so it reveals nothing", async () => {
    connect.mockRejectedValue(new Error("ECONNREFUSED"));
    const failed = await POST(account);

    guardHost.mockRejectedValue(
      new UnsafeFetchError("The host resolves to a non-public address.")
    );
    const refused = await POST({ ...account, host: "localhost" });

    expect(refused.status).toBe(failed.status);
    expect(await refused.json()).toEqual(await failed.json());
  });
});
