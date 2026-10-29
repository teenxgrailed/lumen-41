import { createHmac, timingSafeEqual } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";

/**
 * The signed link that proves a person reads a university mailbox. "verify"
 * adds the address to an account (Settings, Plan); "recheck" is the yearly
 * confirmation. Stateless: the link names the account, the address and an
 * expiry, and the signature is the proof. Reusing a link only re-confirms the
 * same address for the same account, so there is nothing to spend.
 */
export type StudentTokenPurpose = "verify" | "recheck";

export type StudentTokenClaims = {
  userId: string;
  email: string;
  purpose: StudentTokenPurpose;
  /** Expiry, epoch milliseconds. */
  expiresAt: number;
};

const PURPOSES: readonly StudentTokenPurpose[] = ["verify", "recheck"];

/** A day to add an address; a re-check gets until the price would lapse. */
export const STUDENT_TOKEN_TTL_MS: Record<StudentTokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  recheck: 30 * 24 * 60 * 60 * 1000,
};

function signature(payload: string): string {
  return createHmac("sha256", authSecret())
    .update(`student-email:${payload}`)
    .digest("base64url");
}

export function signStudentToken(
  input: Omit<StudentTokenClaims, "expiresAt">,
  nowMs: number
): string {
  const payload = Buffer.from(
    JSON.stringify({
      u: input.userId,
      e: input.email,
      p: input.purpose,
      x: nowMs + STUDENT_TOKEN_TTL_MS[input.purpose],
    })
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyStudentToken(
  token: string | null | undefined,
  nowMs: number
): StudentTokenClaims | null {
  if (!token) return null;
  const [payload, candidate, extra] = token.split(".");
  if (!payload || !candidate || extra !== undefined) return null;
  const expected = Buffer.from(signature(payload));
  const given = Buffer.from(candidate);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { u?: unknown; e?: unknown; p?: unknown; x?: unknown };
    if (
      typeof claims.u !== "string" ||
      !claims.u ||
      typeof claims.e !== "string" ||
      !claims.e ||
      !PURPOSES.includes(claims.p as StudentTokenPurpose) ||
      typeof claims.x !== "number" ||
      claims.x <= nowMs
    ) {
      return null;
    }
    return {
      userId: claims.u,
      email: claims.e,
      purpose: claims.p as StudentTokenPurpose,
      expiresAt: claims.x,
    };
  } catch {
    return null;
  }
}
