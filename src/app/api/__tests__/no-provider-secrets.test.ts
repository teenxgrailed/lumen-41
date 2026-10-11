import { NextRequest } from "next/server";

import { PUT as putLogSettings } from "@/app/api/logs/settings/route";
import {
  GET as getMailAccounts,
  POST as postMailAccount,
} from "@/app/api/mail/accounts/route";
import { GET as getMailMessage } from "@/app/api/mail/messages/[id]/route";
import {
  GET as getSystemSettings,
  PATCH as patchSystemSettings,
} from "@/app/api/system-settings/route";
import { PATCH as patchTaskProvider } from "@/app/api/task-sync/providers/[id]/route";
import { GET as getTaskProviders } from "@/app/api/task-sync/providers/route";

import { SECRET_MASK } from "@/lib/api/public-records";
import { authenticateRequest, requireAdmin } from "@/lib/auth/api-auth";
import { clearResendInstance } from "@/lib/email/resend";
import {
  listMailAccounts,
  getMailMessage as loadMailMessage,
} from "@/lib/mail-db";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(),
  requireAdmin: jest.fn(),
}));
jest.mock("@/lib/mail-db", () => ({
  getMailMessage: jest.fn(),
  listMailAccounts: jest.fn(),
  updateMailMessage: jest.fn(),
}));
jest.mock("@/lib/mail/providers", () => ({
  fetchGmailBody: jest.fn(),
  fetchImapBody: jest.fn(),
  fetchOutlookBody: jest.fn(),
  mutateGmailMessage: jest.fn(),
  mutateImapMessage: jest.fn(),
  mutateOutlookMessage: jest.fn(),
}));
jest.mock("@/lib/mail/sanitize", () => ({
  sanitizeMailHtml: (html: string) => ({ html, hasRemoteImages: false }),
}));
jest.mock("@/lib/entitlements", () => ({
  canAddMailbox: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueMailSync: jest.fn(),
  ensureMailSyncSchedule: jest.fn(),
}));
jest.mock("@/services/ai/encryption", () => ({
  encryptSecret: () => "ciphertext-imap-credentials",
}));
jest.mock("imapflow", () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock("@/lib/email/resend", () => ({ clearResendInstance: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    mailAccount: { upsert: jest.fn() },
    systemSettings: { findFirst: jest.fn(), upsert: jest.fn() },
    taskProvider: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    project: { findFirst: jest.fn() },
  },
}));

const FORBIDDEN_KEYS = [
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "encryptedCredentials",
  "password",
  "clientSecret",
  "apiKey",
];

// Values planted in every mocked row. The mocks return them whatever `select`
// the route asked for, so only the response mapping can keep them out.
const SECRET_VALUES = [
  "stored-access-credential-value",
  "stored-refresh-credential-value",
  "ciphertext-imap-credentials",
  "google-client-secret-value",
  "outlook-client-secret-value",
  "re_resend-api-key-value",
];

const mockAuthenticateRequest = jest.mocked(authenticateRequest);
const mockRequireAdmin = jest.mocked(requireAdmin);
const mockLoadMailMessage = jest.mocked(loadMailMessage);
const mockListMailAccounts = jest.mocked(listMailAccounts);
const db = prisma as unknown as {
  $transaction: jest.Mock;
  mailAccount: { upsert: jest.Mock };
  systemSettings: { findFirst: jest.Mock; upsert: jest.Mock };
  taskProvider: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const now = new Date("2026-10-11T10:00:00.000Z");

const connection = {
  id: "conn-1",
  provider: "GOOGLE",
  email: "owner@example.com",
  accessToken: "stored-access-credential-value",
  refreshToken: "stored-refresh-credential-value",
  access_token: "stored-access-credential-value",
  refresh_token: "stored-refresh-credential-value",
  expiresAt: now,
  caldavUrl: null,
  caldavUsername: null,
  userId: "user-1",
  createdAt: now,
  updatedAt: now,
};

const mailAccount = {
  id: "mail-1",
  userId: "user-1",
  provider: "IMAP",
  address: "owner@example.com",
  encryptedCredentials: "ciphertext-imap-credentials",
  password: "ciphertext-imap-credentials",
  connectionRef: "conn-1",
  connection,
  status: "ACTIVE",
  syncCursor: "cursor",
  lastSyncAt: now,
  createdAt: now,
  updatedAt: now,
};

const taskProvider = {
  id: "provider-1",
  userId: "user-1",
  type: "OUTLOOK",
  name: "Outlook",
  enabled: true,
  syncEnabled: true,
  syncInterval: "hourly",
  lastSyncedAt: now,
  accessToken: "stored-access-credential-value",
  refreshToken: "stored-refresh-credential-value",
  expiresAt: now,
  accountId: "conn-1",
  account: connection,
  defaultProjectId: null,
  settings: {},
  error: null,
  createdAt: now,
  updatedAt: now,
};

const systemSettings = {
  id: "default",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret-value",
  outlookClientId: "outlook-client-id",
  outlookClientSecret: "outlook-client-secret-value",
  outlookTenantId: "common",
  logLevel: "none",
  logRetention: null,
  logDestination: "db",
  publicSignup: true,
  requireEmailVerificationBeforeAccess: false,
  disableHomepage: false,
  resendApiKey: "re_resend-api-key-value",
  createdAt: now,
  updatedAt: now,
};

function keysOf(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      keysOf(child, keys);
    }
  }
  return keys;
}

async function bodyOf(response: Response | undefined) {
  if (!response) throw new Error("Expected a route response.");
  const text = await response.text();
  return { status: response.status, text, json: JSON.parse(text) as unknown };
}

function expectNoSecretValues(text: string) {
  for (const secret of SECRET_VALUES) expect(text).not.toContain(secret);
}

function expectNoSecrets(text: string, json: unknown) {
  expectNoSecretValues(text);
  const keys = keysOf(json).map((key) => key.toLowerCase());
  for (const forbidden of FORBIDDEN_KEYS) {
    expect(keys.filter((key) => key.includes(forbidden.toLowerCase()))).toEqual(
      []
    );
    expect(text).not.toContain(forbidden);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue({
    userId: "user-1",
    workspace: null,
  } as never);
  mockRequireAdmin.mockResolvedValue(null as never);
  db.$transaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      callback({
        systemSettings: {
          findFirst: jest.fn().mockResolvedValue(systemSettings),
          create: jest.fn().mockResolvedValue(systemSettings),
          update: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...systemSettings, ...data })),
        },
      })
  );
});

describe("API responses never carry provider secrets", () => {
  it("GET /api/mail/messages/[id] keeps only the account summary", async () => {
    mockLoadMailMessage.mockResolvedValue({
      id: "msg-1",
      accountId: "mail-1",
      externalId: "ext-1",
      threadId: null,
      fromName: "Sender",
      fromAddress: "sender@example.com",
      toAddresses: ["owner@example.com"],
      subject: "Hello",
      snippet: "Hi",
      date: now,
      isRead: false,
      isArchived: false,
      snoozedUntil: null,
      labels: [],
      bodyHtml: "<p>Hi</p>",
      createdAt: now,
      updatedAt: now,
      account: mailAccount,
    } as never);

    const { status, text, json } = await bodyOf(
      await getMailMessage(
        new NextRequest("http://localhost/api/mail/messages/msg-1"),
        { params: Promise.resolve({ id: "msg-1" }) }
      )
    );

    expect(status).toBe(200);
    expectNoSecrets(text, json);
    expect(json).toMatchObject({
      id: "msg-1",
      subject: "Hello",
      fromAddress: "sender@example.com",
      isRead: false,
      bodyHtml: "<p>Hi</p>",
      hasRemoteImages: false,
      account: {
        id: "mail-1",
        provider: "IMAP",
        address: "owner@example.com",
        status: "ACTIVE",
      },
    });
    expect((json as { account: object }).account).not.toHaveProperty(
      "connection"
    );
  });

  it("GET /api/mail/accounts lists mailboxes without credentials", async () => {
    mockListMailAccounts.mockResolvedValue([
      { ...mailAccount, _count: { messages: 3 } },
    ] as never);

    const { status, text, json } = await bodyOf(
      await getMailAccounts(
        new NextRequest("http://localhost/api/mail/accounts")
      )
    );

    expect(status).toBe(200);
    expectNoSecrets(text, json);
    expect(json).toEqual([
      expect.objectContaining({
        id: "mail-1",
        provider: "IMAP",
        address: "owner@example.com",
        status: "ACTIVE",
        _count: { messages: 3 },
      }),
    ]);
  });

  it("POST /api/mail/accounts does not echo the stored credentials", async () => {
    db.mailAccount.upsert.mockResolvedValue(mailAccount);

    const { status, text, json } = await bodyOf(
      await postMailAccount(
        new NextRequest("http://localhost/api/mail/accounts", {
          method: "POST",
          body: JSON.stringify({
            address: "owner@example.com",
            host: "imap.example.com",
            port: 993,
            secure: true,
            username: "owner",
            password: "hunter2",
          }),
        })
      )
    );

    expect(status).toBe(201);
    expectNoSecrets(text, json);
    expect(text).not.toContain("hunter2");
    expect(json).toMatchObject({ id: "mail-1", address: "owner@example.com" });
  });

  it("GET /api/task-sync/providers drops provider tokens", async () => {
    db.taskProvider.findMany.mockResolvedValue([taskProvider]);

    const { status, text, json } = await bodyOf(
      await getTaskProviders(
        new NextRequest("http://localhost/api/task-sync/providers")
      )
    );

    expect(status).toBe(200);
    expectNoSecrets(text, json);
    expect(json).toEqual([
      expect.objectContaining({
        id: "provider-1",
        type: "OUTLOOK",
        name: "Outlook",
        accountId: "conn-1",
        syncEnabled: true,
      }),
    ]);
  });

  it("PATCH /api/task-sync/providers/[id] drops provider tokens", async () => {
    db.taskProvider.findUnique.mockResolvedValue(taskProvider);
    db.taskProvider.update.mockResolvedValue({ ...taskProvider, name: "Work" });

    const { status, text, json } = await bodyOf(
      await patchTaskProvider(
        new NextRequest("http://localhost/api/task-sync/providers/provider-1", {
          method: "PATCH",
          body: JSON.stringify({ name: "Work" }),
        }),
        { params: Promise.resolve({ id: "provider-1" }) }
      )
    );

    expect(status).toBe(200);
    expectNoSecrets(text, json);
    expect(json).toMatchObject({
      provider: { id: "provider-1", name: "Work" },
    });
  });

  it("GET /api/system-settings masks stored secrets", async () => {
    const { status, text, json } = await bodyOf(
      await getSystemSettings(
        new NextRequest("http://localhost/api/system-settings")
      )
    );

    expect(status).toBe(200);
    expectNoSecretValues(text);
    expect(json).toMatchObject({
      googleClientId: "google-client-id",
      googleClientSecret: SECRET_MASK,
      outlookClientSecret: SECRET_MASK,
      resendApiKey: SECRET_MASK,
      publicSignup: true,
    });
  });

  it("PATCH /api/system-settings keeps secrets when the mask is echoed back", async () => {
    let written: Record<string, unknown> = {};
    db.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          systemSettings: {
            findFirst: jest.fn().mockResolvedValue(systemSettings),
            update: jest.fn().mockImplementation(({ data }) => {
              written = data;
              return { ...systemSettings, ...data };
            }),
          },
        })
    );

    const { status, text } = await bodyOf(
      await patchSystemSettings(
        new NextRequest("http://localhost/api/system-settings", {
          method: "PATCH",
          body: JSON.stringify({
            googleClientSecret: SECRET_MASK,
            outlookClientSecret: `${SECRET_MASK}x`,
            resendApiKey: SECRET_MASK,
            disableHomepage: true,
          }),
        })
      )
    );

    expect(status).toBe(200);
    expectNoSecretValues(text);
    expect(written).toEqual({ disableHomepage: true });
    // The key did not change, so the cached Resend client stays.
    expect(clearResendInstance).not.toHaveBeenCalled();
  });

  it("PATCH /api/system-settings drops the cached Resend client on a new key", async () => {
    const { status } = await bodyOf(
      await patchSystemSettings(
        new NextRequest("http://localhost/api/system-settings", {
          method: "PATCH",
          body: JSON.stringify({ resendApiKey: "replacement-resend-key" }),
        })
      )
    );

    expect(status).toBe(200);
    expect(clearResendInstance).toHaveBeenCalledTimes(1);
  });

  it("PUT /api/logs/settings returns only the log settings", async () => {
    db.systemSettings.findFirst.mockResolvedValue(systemSettings);
    db.systemSettings.upsert.mockResolvedValue({
      ...systemSettings,
      logLevel: "warn",
    });

    const { status, text, json } = await bodyOf(
      await putLogSettings(
        new NextRequest("http://localhost/api/logs/settings", {
          method: "PUT",
          body: JSON.stringify({ logLevel: "warn" }),
        })
      )
    );

    expect(status).toBe(200);
    expectNoSecrets(text, json);
    expect(json).toEqual({
      logLevel: "warn",
      logDestination: "db",
      logRetention: null,
    });
  });
});
