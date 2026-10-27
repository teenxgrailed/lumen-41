import { prisma } from "@/lib/prisma";

export async function getEmailVerificationStatus(userId: string) {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    }),
    prisma.systemSettings.findFirst({
      select: { requireEmailVerificationBeforeAccess: true },
    }),
  ]);
  return {
    email: user?.email ?? null,
    verified: Boolean(user?.emailVerified),
    required: settings?.requireEmailVerificationBeforeAccess ?? true,
  };
}

export async function requiresEmailVerificationBeforeAccess(): Promise<boolean> {
  const settings = await prisma.systemSettings.findFirst({
    select: { requireEmailVerificationBeforeAccess: true },
  });
  return settings?.requireEmailVerificationBeforeAccess ?? true;
}
