import { prisma } from "@/lib/prisma";
import { createTtlCache } from "@/lib/ttl-cache";

/**
 * Whether email verification gates access. It is one setting row that changes
 * rarely, but it is read on every connector call, so it is kept for a short
 * time (15 s: it gates access, so it stays short). The verified flag of the
 * person is never cached.
 */
export const EMAIL_VERIFICATION_SETTING_TTL_MS = 15_000;
const settingCache = createTtlCache<boolean>({
  name: "system-settings",
  ttlMs: EMAIL_VERIFICATION_SETTING_TTL_MS,
});

export function requiresEmailVerificationBeforeAccess(): Promise<boolean> {
  return settingCache.get("requireEmailVerificationBeforeAccess", async () => {
    const settings = await prisma.systemSettings.findFirst({
      select: { requireEmailVerificationBeforeAccess: true },
    });
    return settings?.requireEmailVerificationBeforeAccess ?? true;
  });
}

export async function getEmailVerificationStatus(userId: string) {
  const [user, required] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    }),
    requiresEmailVerificationBeforeAccess(),
  ]);
  return {
    email: user?.email ?? null,
    verified: Boolean(user?.emailVerified),
    required,
  };
}
