import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * The bearer credentials a person handed to other software besides connector
 * tokens: OAuth access and refresh tokens (MCP clients), codes not yet
 * exchanged, and the tokens of the agents they run in the Hub. Each is a write
 * returned unawaited so it can join `prisma.$transaction([...])` next to the
 * password reset or sign-out that caused it (see `revokeAllAccess`).
 */
export function revokeDelegatedTokens(userId: string) {
  const now = newDate();
  return [
    prisma.oAuthAuthorizationCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.oAuthToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.hubAgentToken.updateMany({
      where: { agent: { userId }, revokedAt: null },
      data: { revokedAt: now },
    }),
  ] as const;
}
