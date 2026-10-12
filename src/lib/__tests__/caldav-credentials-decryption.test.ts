import { ConnectedAccount } from "@prisma/client";
import { createDAVClient } from "tsdav";

import { CalDAVCalendarService } from "@/lib/caldav-calendar";
import { encryptSecret } from "@/lib/security/secret-encryption";
import { CalDAVTaskProvider } from "@/lib/task-sync/providers/caldav-provider";

jest.mock("tsdav", () => ({
  ...jest.requireActual("tsdav"),
  createDAVClient: jest.fn(async () => ({
    fetchCalendars: jest.fn(async () => []),
  })),
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function account(accessToken: string): ConnectedAccount {
  return {
    id: "acct-1",
    provider: "CALDAV",
    email: "user@example.com",
    caldavUrl: "https://dav.example.com",
    caldavUsername: "user",
    accessToken,
    refreshToken: null,
  } as unknown as ConnectedAccount;
}

function passwordUsed(): string {
  const [options] = (createDAVClient as jest.Mock).mock.calls.at(-1) as [
    { credentials: { password: string } },
  ];
  return options.credentials.password;
}

describe("CalDAV credentials are decrypted before reaching the server", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calendar service authenticates with the plaintext password", async () => {
    const service = new CalDAVCalendarService(
      account(encryptSecret("app-password"))
    );
    // getClient is private; it is where every request gets its credentials.
    await (service as unknown as { getClient(): Promise<unknown> }).getClient();
    expect(passwordUsed()).toBe("app-password");
  });

  it("task provider authenticates with the plaintext password", async () => {
    await new CalDAVTaskProvider(
      account(encryptSecret("task-password"))
    ).getTaskLists();
    expect(passwordUsed()).toBe("task-password");
  });

  it("legacy plaintext rows keep working", async () => {
    await new CalDAVTaskProvider(account("legacy-password")).getTaskLists();
    expect(passwordUsed()).toBe("legacy-password");
  });
});
