import { sign } from "node:crypto";
import http2 from "node:http2";

import { ApnsConfiguration, getApnsConfiguration } from "@/lib/apns-config";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ApnsDelivery";

/** A saved APNs device token, as the senders load it. */
export type NativePushTarget = {
  id: string;
  token: string;
  bundleId: string;
  environment: string;
};

export type NativePushPayload = {
  title: string;
  body: string;
  /** A same-origin path the app opens when the notification is tapped. */
  url: string;
  taskId?: string;
};

type ApnsEnvironment = "production" | "sandbox";

const HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

/** APNs tokens are hex; anything else never reaches a request path. */
export const APNS_TOKEN_PATTERN = /^[0-9a-f]{64,200}$/i;

export type ApnsResponse = { status: number; reason?: string };
export type ApnsTransport = (
  host: string,
  path: string,
  headers: Record<string, string>,
  body: string
) => Promise<ApnsResponse>;

// Apple refuses a provider token older than an hour and one refreshed more
// often than every 20 minutes, so one token is reused for 50 minutes.
const JWT_LIFETIME_SECONDS = 50 * 60;
let cachedJwt: { value: string; issuedAt: number; keyId: string } | null = null;

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

export function apnsJwt(
  config: Extract<ApnsConfiguration, { configured: true }>,
  nowSeconds: number
) {
  if (
    cachedJwt &&
    cachedJwt.keyId === config.keyId &&
    nowSeconds - cachedJwt.issuedAt < JWT_LIFETIME_SECONDS
  ) {
    return cachedJwt.value;
  }
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(
    JSON.stringify({ iss: config.teamId, iat: nowSeconds })
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  const value = `${header}.${claims}.${base64url(signature)}`;
  cachedJwt = { value, issuedAt: nowSeconds, keyId: config.keyId };
  return value;
}

export function resetApnsJwtForTests() {
  cachedJwt = null;
}

/**
 * At most `maxBytes` of UTF-8: APNs counts bytes (4 KB per payload), and a
 * string of emoji is four bytes a character. Never ends on half a surrogate
 * pair, which JSON would spell out as a six-byte escape.
 */
export function clipUtf8(text: string, maxBytes: number) {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  let clipped = text.slice(0, maxBytes);
  while (Buffer.byteLength(clipped) > maxBytes) {
    clipped = clipped.slice(0, -1);
  }
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
}

/** The APNs body: the alert, plus `url` and `taskId` for the tap handler. */
export function apnsBody(payload: NativePushPayload) {
  return JSON.stringify({
    aps: {
      alert: {
        title: clipUtf8(payload.title, 256),
        // Quotes, backslashes and newlines double when JSON escapes them, so
        // the budget leaves room for that under the 4 KB payload limit.
        body: clipUtf8(payload.body, 1500),
      },
      sound: "default",
    },
    url: clipUtf8(payload.url, 1024),
    ...(payload.taskId ? { taskId: payload.taskId } : {}),
  });
}

const sessions = new Map<string, http2.ClientHttp2Session>();

function sessionFor(host: string) {
  const existing = sessions.get(host);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const session = http2.connect(host);
  const forget = () => {
    if (sessions.get(host) === session) sessions.delete(host);
  };
  session.on("error", forget);
  session.on("close", forget);
  session.on("goaway", forget);
  // An idle connection closes after a minute; the next push opens a new one.
  session.setTimeout(60_000, () => session.close());
  session.unref();
  sessions.set(host, session);
  return session;
}

const http2Transport: ApnsTransport = (host, path, headers, body) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let status = 0;
    let data = "";
    const session = sessionFor(host);
    const request = session.request({
      ":method": "POST",
      ":path": path,
      "content-type": "application/json",
      ...headers,
    });
    request.setEncoding("utf8");
    request.on("response", (responseHeaders) => {
      status = Number(responseHeaders[":status"]);
    });
    request.on("data", (chunk: string) => {
      data += chunk;
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      let reason: string | undefined;
      try {
        reason = (JSON.parse(data) as { reason?: string }).reason;
      } catch {
        // A 200 has no body.
      }
      resolve({ status, reason });
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.on("close", () => {
      if (settled) return;
      settled = true;
      reject(new Error("APNs request closed without an answer"));
    });
    // Settle at once: closing a stream that never connected waits for the
    // connection, which an unreachable host never gives. A connection that
    // never came up is dropped too, so the next push does not queue on it.
    request.setTimeout(10_000, () => {
      // `pending` is also true for a stream queued on a live connection
      // (APNs allows one stream at first); only a connection that never
      // came up is dropped.
      const connecting = request.pending && session.connecting;
      if (!settled) {
        settled = true;
        reject(new Error("APNs did not answer in 10 seconds"));
      }
      request.destroy();
      if (connecting) {
        if (sessions.get(host) === session) sessions.delete(host);
        session.destroy();
      }
    });
    request.end(body);
  });

let hasWarnedAboutMissingConfiguration = false;

/**
 * Sends one notification to one iOS device. Resolves true when Apple accepted
 * it and false when it was not sent (no APNs key on this server, or a token
 * Apple says is dead, which is then deleted). Throws when Apple refused the
 * message for another reason, so a caller can retry, like `deliverPush` does
 * for web push.
 *
 * A token from a debug build is a sandbox token: production answers
 * BadDeviceToken, the sandbox host is tried once, and the row remembers it.
 */
export async function deliverNativePush(
  target: NativePushTarget,
  payload: NativePushPayload,
  transport: ApnsTransport = http2Transport
): Promise<boolean> {
  const config = getApnsConfiguration();
  if (!config.configured) {
    if (!hasWarnedAboutMissingConfiguration) {
      hasWarnedAboutMissingConfiguration = true;
      await logger.warn(
        `APNs delivery is unavailable; missing environment variables: ${config.missingVariables.join(", ")}`,
        { missingVariables: config.missingVariables },
        LOG_SOURCE
      );
    }
    return false;
  }
  if (!APNS_TOKEN_PATTERN.test(target.token)) {
    await forget(target, "MalformedToken");
    return false;
  }

  const body = apnsBody(payload);
  const nowSeconds = Math.floor(newDate().getTime() / 1000);
  const send = (environment: ApnsEnvironment) =>
    transport(
      HOSTS[environment],
      `/3/device/${target.token}`,
      {
        authorization: `bearer ${apnsJwt(config, nowSeconds)}`,
        "apns-topic": target.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        // Like web push: a reminder that cannot arrive in 15 minutes is stale.
        "apns-expiration": String(nowSeconds + 15 * 60),
      },
      body
    );

  const environment: ApnsEnvironment =
    target.environment === "sandbox" ? "sandbox" : "production";
  let response = await send(environment);
  if (
    response.status === 403 &&
    (response.reason === "ExpiredProviderToken" ||
      response.reason === "InvalidProviderToken")
  ) {
    cachedJwt = null;
    response = await send(environment);
  }
  if (
    response.status === 400 &&
    response.reason === "BadDeviceToken" &&
    environment === "production"
  ) {
    const sandbox = await send("sandbox");
    if (sandbox.status === 200) {
      await prisma.nativePushToken.updateMany({
        where: { id: target.id },
        data: { environment: "sandbox" },
      });
      return true;
    }
    response = sandbox;
  }
  if (
    response.status === 410 ||
    (response.status === 400 &&
      (response.reason === "BadDeviceToken" ||
        response.reason === "DeviceTokenNotForTopic"))
  ) {
    await forget(target, response.reason ?? String(response.status));
    return false;
  }
  if (response.status === 413) {
    // The same payload would be refused on every retry.
    await logger.error(
      "APNs refused a payload as too large",
      { bytes: Buffer.byteLength(body) },
      LOG_SOURCE
    );
    return false;
  }
  if (response.status !== 200) {
    await logger.error(
      "APNs rejected a message",
      { status: response.status, reason: response.reason ?? null },
      LOG_SOURCE
    );
    throw new Error(
      `APNs returned ${response.status}${response.reason ? ` ${response.reason}` : ""}`
    );
  }
  return true;
}

async function forget(target: NativePushTarget, reason: string) {
  await prisma.nativePushToken.deleteMany({ where: { id: target.id } });
  await logger.info("Removed dead APNs token", { reason }, LOG_SOURCE);
}
