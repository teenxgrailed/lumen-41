const connect = jest.fn().mockResolvedValue(undefined);
const mailboxOpen = jest.fn().mockResolvedValue(undefined);

jest.mock("imapflow", () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect,
    mailboxOpen,
    logout: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    warn: jest.fn().mockResolvedValue(undefined),
    info: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/lib/mail-db", () => ({
  getMailAccountForSync: jest.fn(async (id: string) => ({
    id,
    provider: "IMAP",
    status: "ACTIVE",
  })),
}));
jest.mock("@/lib/mail/imap-tls", () => ({
  imapConnectionOptions: jest.fn(() => ({})),
}));
jest.mock("@/lib/mail/providers", () => ({
  imapCredentials: jest.fn((account: { id: string }) => {
    if (account.id === "bad") {
      throw new Error("Stored credential could not be decrypted");
    }
    return { host: "imap.example.com" };
  }),
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueMailSync: jest.fn() }));
jest.mock("@/lib/mail/imap-pinned", () => ({
  pinnedImapOptions: jest.fn(async (c: { host: string }) => ({ host: c.host })),
}));

import { startImapIdleWatchers } from "@/lib/mail/imap-idle";

describe("startImapIdleWatchers", () => {
  it("starts the healthy accounts and resolves when one has bad credentials", async () => {
    await expect(
      startImapIdleWatchers(["a", "bad", "b"])
    ).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
