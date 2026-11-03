import { createHmac, timingSafeEqual } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { oauthIssuer } from "@/lib/mcp-config";

/**
 * Stateless signed links for hub attachments: a download link (24 h) and an
 * upload link (15 min). The signature is the proof, so the link works without
 * a bearer token (a video fetcher or a curl one-liner). Purposes are signed
 * into the payload, so a download link cannot be used to upload.
 */
export type LinkPurpose = "get" | "put";

function sign(purpose: LinkPurpose, payload: string): string {
  return createHmac("sha256", authSecret())
    .update(`hub-attachment:${purpose}:${payload}`)
    .digest("base64url");
}

export function signLink<T extends Record<string, unknown>>(
  purpose: LinkPurpose,
  claims: T,
  ttlMs: number,
  nowMs: number
): { token: string; expiresAt: number } {
  const expiresAt = nowMs + ttlMs;
  const payload = Buffer.from(
    JSON.stringify({ ...claims, x: expiresAt })
  ).toString("base64url");
  return { token: `${payload}.${sign(purpose, payload)}`, expiresAt };
}

/** The claims of a valid, unexpired link of this purpose, else null. */
export function verifyLink<T extends Record<string, unknown>>(
  purpose: LinkPurpose,
  token: string | null | undefined,
  nowMs: number
): (T & { x: number }) | null {
  if (!token) return null;
  const [payload, candidate, extra] = token.split(".");
  if (!payload || !candidate || extra !== undefined) return null;
  const expected = Buffer.from(sign(purpose, payload));
  const given = Buffer.from(candidate);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (typeof claims?.x !== "number" || claims.x <= nowMs) return null;
    return claims as T & { x: number };
  } catch {
    return null;
  }
}

export function downloadUrl(token: string): string {
  return `${oauthIssuer()}/api/connect/agent-hub/files?t=${encodeURIComponent(token)}`;
}

export function uploadUrl(token: string): string {
  return `${oauthIssuer()}/api/connect/agent-hub/uploads?t=${encodeURIComponent(token)}`;
}
