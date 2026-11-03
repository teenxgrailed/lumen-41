/** @jest-environment node */
import {
  ApnsTransport,
  apnsBody,
  deliverNativePush,
  pruneStaleNativePushTokens,
  resetApnsJwtForTests,
} from "@/services/push/apns";
import { generateKeyPairSync, verify } from "node:crypto";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    nativePushToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn(),
    },
  },
}));

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const target = {
  id: "tok-1",
  token: "ab".repeat(32),
  bundleId: "app.needt.ios",
  environment: "production",
};
const payload = { title: "Reminder", body: "Call Anna", url: "/today?task=1" };

const saved = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  resetApnsJwtForTests();
  process.env.APNS_KEY_ID = "KEY123";
  process.env.APNS_TEAM_ID = "TEAM456";
  // As Coolify stores it: newlines escaped.
  process.env.APNS_PRIVATE_KEY = pem.replace(/\n/g, "\\n");
});
afterAll(() => {
  process.env = saved;
});

function transport(...answers: { status: number; reason?: string }[]) {
  const calls: {
    host: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  const fn: ApnsTransport = async (host, path, headers, body) => {
    calls.push({ host, path, headers, body });
    return answers.shift() ?? { status: 200 };
  };
  return { fn, calls };
}

describe("deliverNativePush", () => {
  it("posts a signed alert to the production host", async () => {
    const { fn, calls } = transport({ status: 200 });
    await expect(deliverNativePush(target, payload, fn)).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.host).toBe("https://api.push.apple.com");
    expect(call.path).toBe(`/3/device/${target.token}`);
    expect(call.headers["apns-topic"]).toBe("app.needt.ios");
    expect(call.headers["apns-push-type"]).toBe("alert");
    expect(JSON.parse(call.body)).toEqual({
      aps: {
        alert: { title: "Reminder", body: "Call Anna" },
        sound: "default",
      },
      url: "/today?task=1",
    });

    const jwt = call.headers.authorization.replace(/^bearer /, "");
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY123",
    });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString()).iss).toBe(
      "TEAM456"
    );
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url")
      )
    ).toBe(true);
  });

  it("sends nothing without the APNs key", async () => {
    delete process.env.APNS_PRIVATE_KEY;
    const { fn, calls } = transport();
    await expect(deliverNativePush(target, payload, fn)).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("learns a debug build's sandbox token", async () => {
    const { fn, calls } = transport(
      { status: 400, reason: "BadDeviceToken" },
      { status: 200 }
    );
    await expect(deliverNativePush(target, payload, fn)).resolves.toBe(true);
    expect(calls.map((c) => c.host)).toEqual([
      "https://api.push.apple.com",
      "https://api.sandbox.push.apple.com",
    ]);
    expect(prisma.nativePushToken.updateMany).toHaveBeenCalledWith({
      where: { id: "tok-1" },
      data: { environment: "sandbox" },
    });
  });

  it("deletes a token Apple says is gone", async () => {
    const { fn } = transport({ status: 410, reason: "Unregistered" });
    await expect(deliverNativePush(target, payload, fn)).resolves.toBe(false);
    expect(prisma.nativePushToken.deleteMany).toHaveBeenCalledWith({
      where: { id: "tok-1" },
    });
  });

  it("deletes a token both hosts refuse", async () => {
    const { fn } = transport(
      { status: 400, reason: "BadDeviceToken" },
      { status: 400, reason: "BadDeviceToken" }
    );
    await expect(deliverNativePush(target, payload, fn)).resolves.toBe(false);
    expect(prisma.nativePushToken.deleteMany).toHaveBeenCalled();
  });

  it("refreshes the provider token once when Apple says it expired", async () => {
    const { fn, calls } = transport(
      { status: 403, reason: "ExpiredProviderToken" },
      { status: 200 }
    );
    await expect(deliverNativePush(target, payload, fn)).resolves.toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("does not retry a payload Apple calls too large", async () => {
    const { fn } = transport({ status: 413, reason: "PayloadTooLarge" });
    await expect(deliverNativePush(target, payload, fn)).resolves.toBe(false);
    expect(prisma.nativePushToken.deleteMany).not.toHaveBeenCalled();
  });

  it("throws on any other refusal so the job retries", async () => {
    const { fn } = transport({ status: 503, reason: "ServiceUnavailable" });
    await expect(deliverNativePush(target, payload, fn)).rejects.toThrow(
      "APNs returned 503 ServiceUnavailable"
    );
    expect(prisma.nativePushToken.deleteMany).not.toHaveBeenCalled();
  });

  it("never puts a malformed token in a request path", async () => {
    const { fn, calls } = transport();
    await expect(
      deliverNativePush({ ...target, token: "../../x" }, payload, fn)
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("apnsBody", () => {
  it("fits emoji text in APNs's byte limit", () => {
    const body = apnsBody({
      title: "😀".repeat(500),
      body: "😀".repeat(1000),
      url: "/today",
    });
    expect(Buffer.byteLength(body)).toBeLessThan(4096);
    const parsed = JSON.parse(body);
    expect(Buffer.byteLength(parsed.aps.alert.body)).toBeLessThanOrEqual(2048);
    expect(parsed.aps.alert.body).not.toMatch(/[\ud800-\udbff]$/);
  });

  it("stays under 4 KB when the text is all characters JSON escapes", () => {
    const body = apnsBody({
      title: '"'.repeat(400),
      body: '"\\\n'.repeat(1000),
      url: "/".padEnd(1000, "a"),
    });
    expect(Buffer.byteLength(body)).toBeLessThan(4096);
  });

  it("caps the alert and carries the task id", () => {
    const body = JSON.parse(
      apnsBody({
        title: "t".repeat(500),
        body: "b",
        url: "/x",
        taskId: "task-9",
      })
    );
    expect(body.aps.alert.title).toHaveLength(256);
    expect(body.taskId).toBe("task-9");
  });
});

describe("provider token reuse", () => {
  const bearer = async () => {
    const { fn, calls } = transport({ status: 200 });
    await deliverNativePush(target, payload, fn);
    return calls[0].headers.authorization;
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reuses one token for 50 minutes, then signs a new one", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-04T09:00:00Z") });
    const first = await bearer();
    jest.setSystemTime(new Date("2026-11-04T09:49:00Z"));
    expect(await bearer()).toBe(first);
    jest.setSystemTime(new Date("2026-11-04T09:51:00Z"));
    expect(await bearer()).not.toBe(first);
  });

  it("signs a new token when the team changes", async () => {
    const first = await bearer();
    process.env.APNS_TEAM_ID = "OTHERTEAM";
    const second = await bearer();
    expect(second).not.toBe(first);
    const claims = JSON.parse(
      Buffer.from(second.split(".")[1], "base64url").toString()
    );
    expect(claims.iss).toBe("OTHERTEAM");
  });
});

describe("pruneStaleNativePushTokens", () => {
  it("forgets tokens no launch has refreshed in 30 days", async () => {
    jest.mocked(prisma.nativePushToken.deleteMany).mockResolvedValue({
      count: 2,
    } as never);
    const now = new Date("2026-12-31T00:00:00Z");
    await expect(pruneStaleNativePushTokens(now)).resolves.toBe(2);
    expect(prisma.nativePushToken.deleteMany).toHaveBeenCalledWith({
      where: { updatedAt: { lt: new Date("2026-12-01T00:00:00Z") } },
    });
  });
});
