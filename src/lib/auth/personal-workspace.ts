import { WorkspaceKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const select = { id: true, kind: true } as const;
const inFlight = new Map<string, Promise<unknown>>();

async function ensureOnce(userId: string) {
  const existing = await prisma.workspace.findUnique({
    where: { personalOwnerId: userId },
    select,
  });
  if (existing) return existing;
  // ON CONFLICT DO NOTHING: a concurrent first-load insert is a no-op rather
  // than a unique-constraint failure (which Prisma logs even when caught).
  await prisma.workspace.createMany({
    data: [
      {
        name: "Personal Workspace",
        kind: WorkspaceKind.PERSONAL,
        personalOwnerId: userId,
      },
    ],
    skipDuplicates: true,
  });
  const created = await prisma.workspace.findUnique({
    where: { personalOwnerId: userId },
    select,
  });
  if (!created) throw new Error("Personal workspace could not be created.");
  return created;
}

/** The person's personal workspace row, created once however many callers race. */
export function ensurePersonalWorkspaceRow(
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
