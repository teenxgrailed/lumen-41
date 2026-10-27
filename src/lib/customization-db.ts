import { prisma } from "@/lib/prisma";

export const DEFAULT_CUSTOMIZATION = {
  accentColor: "#6366F1",
  backgroundTint: "#0E0E10",
  density: "comfortable",
  sidebarWidth: 244,
  radius: 8,
  fontFamily: "system",
  eventChipStyle: "flat",
  animationsEnabled: true,
  themePreset: "needt",
};

const inFlight = new Map<string, Promise<unknown>>();

async function ensureOnce(userId: string) {
  const existing = await prisma.userCustomization.findUnique({
    where: { userId },
  });
  if (existing) return existing;
  // ON CONFLICT DO NOTHING: two first-load requests both reach here, one
  // inserts, the other is a no-op, and neither raises a unique violation.
  await prisma.userCustomization.createMany({
    data: [{ userId, ...DEFAULT_CUSTOMIZATION }],
    skipDuplicates: true,
  });
  const created = await prisma.userCustomization.findUnique({
    where: { userId },
  });
  if (!created) throw new Error("Customization row could not be created.");
  return created;
}

/** Returns the person's customization row, creating the default once. */
export function ensureUserCustomization(
  userId: string
): ReturnType<typeof ensureOnce> {
  const pending = inFlight.get(userId);
  if (pending) return pending as ReturnType<typeof ensureOnce>;
  const run = ensureOnce(userId).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, run);
  return run;
}
