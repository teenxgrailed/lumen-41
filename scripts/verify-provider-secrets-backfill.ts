/**
 * Proves the provider-secrets backfill and the TokenManager write path against
 * a real PostgreSQL database. Not run in CI.
 *
 *   DATABASE_URL=postgresql://postgres@localhost:55432/needt_verify \
 *   DIRECT_URL=$DATABASE_URL npx prisma migrate deploy
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/verify-provider-secrets-backfill.ts
 *
 * The script deletes and re-seeds its own rows, so it refuses any database
 * that is not on loopback. Google and Microsoft token endpoints are replaced
 * by a local HTTP server; nothing leaves the machine.
 */
import { decryptSecret as decryptAiSecret } from "@/services/ai/encryption";
import {
  type ProviderSecretsBackfillResult,
  backfillProviderSecrets,
} from "@/services/security/provider-secrets-backfill";
import { OAuth2Client } from "google-auth-library";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { MICROSOFT_GRAPH_AUTH_ENDPOINTS } from "@/lib/outlook";
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";
import { TokenManager } from "@/lib/token-manager";

const PREFIX = "verify-backfill-";
const BULK_ROWS = 1500;
const CONCURRENT_REFRESHES = 200;

process.env.AI_ENCRYPTION_KEY ??= "verify-provider-secrets-backfill-key";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";

function requireLoopbackDatabase() {
  const raw = process.env.DATABASE_URL;
  assert(raw, "DATABASE_URL is required");
  const url = new URL(raw);
  assert(
    url.hostname === "127.0.0.1" || url.hostname === "localhost",
    "DATABASE_URL must target loopback; this script deletes rows"
  );
}

const md5 = (value: string | null) =>
  value === null
    ? "null"
    : crypto.createHash("md5").update(value).digest("hex");

/** The AI/IMAP format exactly as origin/main wrote it before this change. */
function legacyAiEncrypt(value: string): string {
  const key = crypto
    .createHash("sha256")
    .update(process.env.AI_ENCRYPTION_KEY as string)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function fakeToken(label: string, bytes = 48) {
  return `${label}-${crypto.randomBytes(bytes).toString("base64url")}`;
}

type Column = { table: string; column: string; covered: boolean };

const COLUMNS: Column[] = [
  { table: "ConnectedAccount", column: "accessToken", covered: true },
  { table: "ConnectedAccount", column: "refreshToken", covered: true },
  { table: "TaskProvider", column: "accessToken", covered: true },
  { table: "TaskProvider", column: "refreshToken", covered: true },
  { table: "Account", column: "access_token", covered: true },
  { table: "Account", column: "refresh_token", covered: true },
  { table: "Account", column: "id_token", covered: false },
  { table: "SystemSettings", column: "googleClientSecret", covered: true },
  { table: "SystemSettings", column: "outlookClientSecret", covered: true },
  { table: "SystemSettings", column: "resendApiKey", covered: true },
  { table: "MailAccount", column: "encryptedCredentials", covered: false },
  { table: "AISettings", column: "encryptedApiKey", covered: false },
  {
    table: "AIOAuthConnection",
    column: "encryptedAccessToken",
    covered: false,
  },
];

type Snapshot = Map<string, string | null>;

async function readColumn(table: string, column: string) {
  return prisma.$queryRawUnsafe<{ id: string; value: string | null }[]>(
    `SELECT id, "${column}" AS value FROM "${table}" ORDER BY id`
  );
}

async function snapshot(): Promise<Snapshot> {
  const result: Snapshot = new Map();
  for (const { table, column } of COLUMNS) {
    for (const row of await readColumn(table, column)) {
      result.set(`${table}.${column}.${row.id}`, row.value);
    }
  }
  return result;
}

function totals(result: ProviderSecretsBackfillResult) {
  const tables = [
    result.connectedAccount,
    result.taskProvider,
    result.account,
    result.systemSettings,
  ];
  return tables.reduce(
    (sum, t) => ({
      scanned: sum.scanned + t.scanned,
      updated: sum.updated + t.updated,
      skipped: sum.skipped + t.skipped,
      failed: sum.failed + t.failed,
    }),
    { scanned: 0, updated: 0, skipped: 0, failed: 0 }
  );
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.connectedAccount.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.systemSettings.deleteMany({});
}

/** Plaintext originals by `table.column.id`, as a caller should see them. */
const plaintext = new Map<string, string | null>();

async function seed() {
  const users = ["a", "b"].map((s) => `${PREFIX}user-${s}`);
  for (const id of users) {
    await prisma.user.create({ data: { id, email: `${id}@example.test` } });
  }
  const [userA, userB] = users;

  const longJwt = `eyJ0eXAiOiJKV1QifQ.${crypto.randomBytes(1800).toString("base64url")}.sig`;
  const connected = [
    {
      id: "google",
      provider: "GOOGLE",
      accessToken: fakeToken("g-access"),
      refreshToken: fakeToken("g-refresh"),
    },
    {
      id: "outlook",
      provider: "OUTLOOK",
      accessToken: longJwt,
      refreshToken: fakeToken("o-refresh", 600),
    },
    {
      id: "caldav",
      provider: "CALDAV",
      accessToken: "caldav app pässword ✓ 'quoted'",
      refreshToken: null,
      caldavUrl: "https://dav.example.test/",
    },
    {
      id: "caldav-empty",
      provider: "CALDAV",
      accessToken: "",
      refreshToken: null,
      caldavUrl: "https://dav2.example.test/",
    },
    {
      id: "google-no-refresh",
      provider: "GOOGLE",
      accessToken: fakeToken("g2-access"),
      refreshToken: null,
      email: "second@example.test",
    },
  ];
  for (const row of connected) {
    const id = `${PREFIX}ca-${row.id}`;
    await prisma.connectedAccount.create({
      data: {
        id,
        userId: userA,
        provider: row.provider,
        email: row.email ?? `${row.id}@example.test`,
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        expiresAt: new Date(Date.now() + 3600_000),
        caldavUrl: row.caldavUrl ?? null,
        caldavUsername: row.caldavUrl ? "dav-user" : null,
      },
    });
    plaintext.set(`ConnectedAccount.accessToken.${id}`, row.accessToken);
    plaintext.set(`ConnectedAccount.refreshToken.${id}`, row.refreshToken);
  }

  // Already encrypted by the new write path before the backfill runs.
  const { encryptSecret } = await import("@/lib/security/secret-encryption");
  const preAccess = fakeToken("pre-access");
  const preRefresh = fakeToken("pre-refresh");
  const preId = `${PREFIX}ca-pre-encrypted`;
  await prisma.connectedAccount.create({
    data: {
      id: preId,
      userId: userB,
      provider: "GOOGLE",
      email: "pre@example.test",
      accessToken: encryptSecret(preAccess),
      refreshToken: encryptSecret(preRefresh),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  plaintext.set(`ConnectedAccount.accessToken.${preId}`, preAccess);
  plaintext.set(`ConnectedAccount.refreshToken.${preId}`, preRefresh);

  // Half-migrated: access encrypted, refresh still plaintext.
  const halfId = `${PREFIX}ca-half`;
  const halfAccess = fakeToken("half-access");
  const halfRefresh = fakeToken("half-refresh");
  await prisma.connectedAccount.create({
    data: {
      id: halfId,
      userId: userB,
      provider: "OUTLOOK",
      email: "half@example.test",
      accessToken: encryptSecret(halfAccess),
      refreshToken: halfRefresh,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  plaintext.set(`ConnectedAccount.accessToken.${halfId}`, halfAccess);
  plaintext.set(`ConnectedAccount.refreshToken.${halfId}`, halfRefresh);

  const providers = [
    {
      id: "nulls",
      userId: userA,
      type: "OUTLOOK",
      accessToken: null,
      refreshToken: null,
    },
    {
      id: "tokens",
      userId: userB,
      type: "OUTLOOK",
      accessToken: fakeToken("tp-access"),
      refreshToken: fakeToken("tp-refresh"),
    },
    {
      id: "google",
      userId: userA,
      type: "GOOGLE",
      accessToken: fakeToken("tp-g"),
      refreshToken: null,
    },
  ];
  for (const row of providers) {
    const id = `${PREFIX}tp-${row.id}`;
    await prisma.taskProvider.create({
      data: {
        id,
        userId: row.userId,
        type: row.type,
        name: row.id,
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
      },
    });
    plaintext.set(`TaskProvider.accessToken.${id}`, row.accessToken);
    plaintext.set(`TaskProvider.refreshToken.${id}`, row.refreshToken);
  }

  // Shaped like a bcrypt hash (60 chars, $2b$10$ prefix), assembled at
  // runtime so secret scanners do not flag a fixture.
  const bcryptHash = ["", "2b", "10", "x".repeat(22) + "y".repeat(31)].join(
    "$"
  );
  const accounts = [
    {
      id: "google",
      userId: userA,
      type: "oauth",
      provider: "google",
      access_token: fakeToken("na-access"),
      refresh_token: fakeToken("na-refresh"),
      id_token: `eyJhbGciOiJSUzI1NiJ9.${crypto.randomBytes(200).toString("base64url")}.sig`,
    },
    {
      id: "credentials",
      userId: userB,
      type: "credentials",
      provider: "credentials",
      access_token: null,
      refresh_token: null,
      id_token: bcryptHash,
    },
    {
      id: "azure",
      userId: userB,
      type: "oauth",
      provider: "azure-ad",
      access_token: fakeToken("az-access", 900),
      refresh_token: null,
      id_token: null,
    },
  ];
  for (const row of accounts) {
    const id = `${PREFIX}acc-${row.id}`;
    await prisma.account.create({
      data: {
        id,
        userId: row.userId,
        type: row.type,
        provider: row.provider,
        providerAccountId: `${PREFIX}${row.id}`,
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        id_token: row.id_token,
      },
    });
    plaintext.set(`Account.access_token.${id}`, row.access_token);
    plaintext.set(`Account.refresh_token.${id}`, row.refresh_token);
    plaintext.set(`Account.id_token.${id}`, row.id_token);
  }

  // Old-format AI / IMAP ciphertext (no enc:v1: prefix) must stay untouched
  // and still decrypt after the encryption module was refactored.
  const imapCreds = JSON.stringify({
    host: "imap.example.test",
    username: "u",
    password: "imap-pass",
  });
  const mailId = `${PREFIX}mail`;
  await prisma.mailAccount.create({
    data: {
      id: mailId,
      userId: userA,
      provider: "IMAP",
      address: "imap@example.test",
      encryptedCredentials: legacyAiEncrypt(imapCreds),
    },
  });
  plaintext.set(`MailAccount.encryptedCredentials.${mailId}`, imapCreds);
  // Admin-saved OAuth client secrets and the Resend key, plaintext as every
  // release before this one stored them.
  const systemSecrets = {
    googleClientSecret: "verify-google-client-secret",
    outlookClientSecret: "verify-outlook-client-secret",
    resendApiKey: "verify-resend-api-key",
  };
  await prisma.systemSettings.create({
    data: {
      id: "default",
      googleClientId: "gid",
      outlookClientId: "oid",
      ...systemSecrets,
    },
  });
  for (const [column, value] of Object.entries(systemSecrets)) {
    plaintext.set(`SystemSettings.${column}.default`, value);
  }

  const aiKey = "sk-verify-ai-key-value";
  const ai = await prisma.aISettings.create({
    data: { userId: userA, encryptedApiKey: legacyAiEncrypt(aiKey) },
  });
  plaintext.set(`AISettings.encryptedApiKey.${ai.id}`, aiKey);
  const aiOauthToken = "ai-oauth-access-value";
  const aiOauth = await prisma.aIOAuthConnection.create({
    data: {
      userId: userA,
      provider: "OPENAI",
      encryptedAccessToken: legacyAiEncrypt(aiOauthToken),
    },
  });
  plaintext.set(
    `AIOAuthConnection.encryptedAccessToken.${aiOauth.id}`,
    aiOauthToken
  );

  // Bulk rows for the concurrency run.
  const bulk = Array.from({ length: BULK_ROWS }, (_, i) => {
    const id = `${PREFIX}bulk-${String(i).padStart(5, "0")}`;
    const accessToken = fakeToken(`bulk-access-${i}`);
    const refreshToken = i % 7 === 0 ? null : fakeToken(`bulk-refresh-${i}`);
    plaintext.set(`ConnectedAccount.accessToken.${id}`, accessToken);
    plaintext.set(`ConnectedAccount.refreshToken.${id}`, refreshToken);
    return {
      id,
      userId: i % 2 ? userA : userB,
      provider: "GOOGLE",
      email: `bulk-${i}@example.test`,
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  });
  await prisma.connectedAccount.createMany({ data: bulk });
}

function checkCovered(after: Snapshot, label: string) {
  let encrypted = 0;
  let nulls = 0;
  let empty = 0;
  for (const { table, column, covered } of COLUMNS) {
    if (!covered) continue;
    for (const [key, value] of after) {
      if (!key.startsWith(`${table}.${column}.`)) continue;
      const expected = plaintext.get(key);
      if (value === null) {
        assert.equal(expected, null, `${label}: ${key} became null`);
        nulls += 1;
        continue;
      }
      if (value === "") {
        assert.equal(expected, "", `${label}: ${key} became empty`);
        empty += 1;
        continue;
      }
      assert(isEncryptedSecret(value), `${label}: ${key} is not enc:v1:`);
      assert.equal(
        md5(decryptSecret(value)),
        md5(expected ?? null),
        `${label}: ${key} decrypts to a different value`
      );
      encrypted += 1;
    }
  }
  return { encrypted, nulls, empty };
}

function checkUncovered(before: Snapshot, after: Snapshot, label: string) {
  let unchanged = 0;
  for (const { table, column, covered } of COLUMNS) {
    if (covered) continue;
    for (const [key, value] of before) {
      if (!key.startsWith(`${table}.${column}.`)) continue;
      assert.equal(after.get(key), value, `${label}: ${key} was modified`);
      unchanged += 1;
    }
  }
  return unchanged;
}

async function verifyStaleWriteGuard() {
  // Deterministic: the moment the backfill is about to write a row, a token
  // refresh lands on that same row. The guarded updateMany must lose.
  const id = `${PREFIX}ca-race`;
  const userId = `${PREFIX}user-a`;
  const original = fakeToken("race-original");
  await prisma.connectedAccount.create({
    data: {
      id,
      userId,
      provider: "GOOGLE",
      email: "race@example.test",
      accessToken: original,
      refreshToken: fakeToken("race-refresh"),
      expiresAt: new Date(),
    },
  });
  const refreshed = fakeToken("race-refreshed");
  const { encryptSecret } = await import("@/lib/security/secret-encryption");

  const delegate = prisma.connectedAccount as unknown as {
    updateMany: (args: { where: { id: string } }) => Promise<{ count: number }>;
  };
  const original_updateMany = delegate.updateMany;
  let intercepted = false;
  delegate.updateMany = async (args) => {
    if (args.where.id === id && !intercepted) {
      intercepted = true;
      await prisma.$executeRaw`UPDATE "ConnectedAccount" SET "accessToken" = ${encryptSecret(refreshed)} WHERE id = ${id}`;
    }
    return original_updateMany.call(delegate, args);
  };
  assert.notEqual(
    delegate.updateMany,
    original_updateMany,
    "could not intercept prisma.connectedAccount.updateMany"
  );

  try {
    const result = await backfillProviderSecrets({ direction: "encrypt" });
    assert(intercepted, "the race row was never written by the backfill");
    assert.equal(result.connectedAccount.failed, 0);
    const row = await prisma.connectedAccount.findUniqueOrThrow({
      where: { id },
    });
    assert.equal(
      decryptSecret(row.accessToken),
      refreshed,
      "stale backfill overwrote the refresh"
    );
    // The row is left with a plaintext refresh token; the next pass fixes it.
    const second = await backfillProviderSecrets({ direction: "encrypt" });
    const fixed = await prisma.connectedAccount.findUniqueOrThrow({
      where: { id },
    });
    assert(isEncryptedSecret(fixed.refreshToken));
    assert.equal(decryptSecret(fixed.accessToken), refreshed);
    return {
      firstPassUpdated: result.connectedAccount.updated,
      secondPassUpdated: second.connectedAccount.updated,
    };
  } finally {
    delegate.updateMany = original_updateMany;
    await prisma.connectedAccount.delete({ where: { id } });
  }
}

async function verifyConcurrentLoad() {
  // Undeterministic companion: random refreshes while a full pass runs.
  const ids = (
    await prisma.connectedAccount.findMany({
      where: { id: { startsWith: `${PREFIX}bulk-` } },
      select: { id: true },
    })
  ).map((r) => r.id);
  // Reset bulk rows to plaintext so the pass has work to do.
  for (const id of ids) {
    await prisma.connectedAccount.update({
      where: { id },
      data: {
        accessToken: plaintext.get(
          `ConnectedAccount.accessToken.${id}`
        ) as string,
        refreshToken:
          plaintext.get(`ConnectedAccount.refreshToken.${id}`) ?? null,
      },
    });
  }
  const { encryptSecret } = await import("@/lib/security/secret-encryption");
  const refreshedIds = new Set<string>();
  const pass = backfillProviderSecrets({ direction: "encrypt", batchSize: 50 });
  const refreshes = (async () => {
    for (let i = 0; i < CONCURRENT_REFRESHES; i++) {
      const id = ids[crypto.randomInt(ids.length)];
      const access = fakeToken(`refreshed-${i}`);
      await prisma.connectedAccount.update({
        where: { id },
        data: { accessToken: encryptSecret(access) },
      });
      plaintext.set(`ConnectedAccount.accessToken.${id}`, access);
      refreshedIds.add(id);
    }
  })();
  const [result] = await Promise.all([pass, refreshes]);
  // Some rows may still hold a plaintext refresh token next to a fresh
  // encrypted access token if the guard skipped them; a second pass finishes.
  const second = await backfillProviderSecrets({ direction: "encrypt" });
  const after = await snapshot();
  checkCovered(after, "concurrent");
  return {
    rows: ids.length,
    refreshes: CONCURRENT_REFRESHES,
    distinctRowsRefreshed: refreshedIds.size,
    pass1: totals(result),
    pass2: totals(second),
  };
}

async function verifyTokenManager() {
  const received: Record<string, URLSearchParams> = {};
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      received[req.url ?? ""] = params;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          access_token: `new-access-for-${req.url?.slice(1)}`,
          refresh_token: `new-refresh-for-${req.url?.slice(1)}`,
          expires_in: 3600,
          token_type: "Bearer",
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  // Point both providers' token endpoints at the local server.
  MICROSOFT_GRAPH_AUTH_ENDPOINTS.token = `http://127.0.0.1:${port}/outlook`;
  Object.defineProperty(OAuth2Client.prototype, "endpoints", {
    configurable: true,
    get() {
      return this.__verifyEndpoints;
    },
    set(value) {
      this.__verifyEndpoints = {
        ...value,
        oauth2TokenUrl: `http://127.0.0.1:${port}/google`,
      };
    },
  });
  // The seeded SystemSettings row is encrypted by now; the providers must
  // still receive the plaintext client secret.
  const settingsRow = await prisma.systemSettings.findUniqueOrThrow({
    where: { id: "default" },
  });
  assert(isEncryptedSecret(settingsRow.googleClientSecret));
  assert(isEncryptedSecret(settingsRow.outlookClientSecret));

  const tm = TokenManager.getInstance();
  const userId = `${PREFIX}user-a`;
  const results: Record<string, unknown> = {};
  try {
    for (const [provider, refresh] of [
      ["google", () => tm.refreshGoogleTokens(`${PREFIX}ca-google`, userId)],
      ["outlook", () => tm.refreshOutlookTokens(`${PREFIX}ca-outlook`, userId)],
    ] as const) {
      const id = `${PREFIX}ca-${provider}`;
      const stored = await prisma.connectedAccount.findUniqueOrThrow({
        where: { id },
      });
      assert(
        isEncryptedSecret(stored.refreshToken),
        `${provider}: fixture should already be encrypted`
      );
      const tokens = await refresh();
      assert(tokens, `${provider}: refresh returned null`);
      const sent = received[`/${provider}`];
      assert(sent, `${provider}: token endpoint was not called`);
      assert.equal(sent.get("grant_type"), "refresh_token");
      assert.equal(
        sent.get("client_secret"),
        plaintext.get(`SystemSettings.${provider}ClientSecret.default`),
        `${provider}: sent something other than the plaintext client secret`
      );
      assert.equal(
        sent.get("refresh_token"),
        plaintext.get(`ConnectedAccount.refreshToken.${id}`),
        `${provider}: sent something other than the plaintext refresh token`
      );
      assert.equal(tokens.accessToken, `new-access-for-${provider}`);
      // google-auth-library keeps the refresh token it was given; Graph
      // rotates it, so the new one must be stored.
      const expectedRefresh =
        provider === "google"
          ? plaintext.get(`ConnectedAccount.refreshToken.${id}`)
          : `new-refresh-for-${provider}`;
      assert.equal(tokens.refreshToken, expectedRefresh);
      const row = await prisma.connectedAccount.findUniqueOrThrow({
        where: { id },
      });
      assert(
        isEncryptedSecret(row.accessToken),
        `${provider}: stored access token is not enc:v1:`
      );
      assert(
        isEncryptedSecret(row.refreshToken),
        `${provider}: stored refresh token is not enc:v1:`
      );
      assert.equal(
        decryptSecret(row.accessToken),
        `new-access-for-${provider}`
      );
      assert.equal(decryptSecret(row.refreshToken as string), expectedRefresh);
      const read = await tm.getTokens(id, userId);
      assert.equal(read?.accessToken, `new-access-for-${provider}`);
      results[provider] =
        "ok: sent plaintext refresh and client secret, stored enc:v1:, returned plaintext";
    }
  } finally {
    server.close();
  }
  return results;
}

async function main() {
  requireLoopbackDatabase();
  await cleanup();
  await seed();

  const original = await snapshot();
  const report: Record<string, unknown> = {
    secretValuesSnapshotted: original.size,
  };

  const first = await backfillProviderSecrets({ direction: "encrypt" });
  assert.equal(totals(first).failed, 0, "encrypt pass failed rows");
  const afterEncrypt = await snapshot();
  report.encryptPass = {
    ...totals(first),
    ...checkCovered(afterEncrypt, "encrypt"),
  };
  report.uncoveredUnchanged = checkUncovered(original, afterEncrypt, "encrypt");

  // Pre-encrypted values must be kept byte-for-byte, not re-encrypted.
  const preKey = `ConnectedAccount.accessToken.${PREFIX}ca-pre-encrypted`;
  assert.equal(afterEncrypt.get(preKey), original.get(preKey));

  // Old-format ciphertext still opens with the refactored AI module.
  for (const { table, column } of COLUMNS.filter(
    (c) => c.table === "MailAccount" || c.table.startsWith("AI")
  )) {
    for (const [key, value] of afterEncrypt) {
      if (!key.startsWith(`${table}.${column}.`)) continue;
      assert.equal(
        decryptAiSecret(value),
        plaintext.get(key),
        `${key} no longer decrypts`
      );
    }
  }
  report.legacyAiCiphertextStillDecrypts = true;

  const second = await backfillProviderSecrets({ direction: "encrypt" });
  assert.equal(totals(second).updated, 0, "second encrypt pass changed rows");
  assert.equal(totals(second).failed, 0);
  const afterSecond = await snapshot();
  for (const [key, value] of afterEncrypt) {
    assert.equal(afterSecond.get(key), value, `idempotent pass changed ${key}`);
  }
  report.idempotentPass = totals(second);

  const back = await backfillProviderSecrets({ direction: "decrypt" });
  assert.equal(totals(back).failed, 0, "decrypt pass failed rows");
  const afterDecrypt = await snapshot();
  let byteEqual = 0;
  let wasCiphertext = 0;
  for (const [key, value] of afterDecrypt) {
    const column = COLUMNS.find((c) =>
      key.startsWith(`${c.table}.${c.column}.`)
    );
    if (!column?.covered) {
      assert.equal(value, original.get(key), `decrypt touched ${key}`);
      continue;
    }
    assert.equal(
      value,
      plaintext.get(key) ?? null,
      `decrypt: ${key} differs from the plaintext`
    );
    if (value === original.get(key)) byteEqual += 1;
    else if (isEncryptedSecret(original.get(key))) wasCiphertext += 1;
  }
  report.decryptPass = {
    ...totals(back),
    byteEqualToOriginal: byteEqual,
    seededAsCiphertextNowPlaintext: wasCiphertext,
  };

  const reEncrypt = await backfillProviderSecrets({ direction: "encrypt" });
  assert.equal(totals(reEncrypt).failed, 0);
  report.staleWriteGuard = await verifyStaleWriteGuard();
  report.concurrentLoad = await verifyConcurrentLoad();
  report.tokenManager = await verifyTokenManager();

  await cleanup();
  process.stdout.write(
    `${JSON.stringify(report, null, 2)}\nALL CHECKS PASSED\n`
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `VERIFICATION FAILED: ${error instanceof Error ? error.stack : String(error)}\n`
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
