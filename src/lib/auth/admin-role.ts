import { requiresEmailVerificationBeforeAccess } from "@/lib/auth/email-verification-access";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminRole";

/**
 * Whether this account is an admin right now, by the same rule as
 * `requireAdmin`: active, role `admin`, and a confirmed email when the
 * deployment requires one. Read from the database on every call, so a
 * demoted or deactivated admin loses access at once. Any error reads as no.
 * Used where there is a user id but no session cookie (MCP, OAuth consent).
 */
export async function isAdminUserId(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true, isActive: true, role: true },
    });
    if (!user || user.isActive !== true || user.role !== "admin") return false;
    if (user.emailVerified) return true;
    return !(await requiresEmailVerificationBeforeAccess());
  } catch (error) {
    logger.error(
      "Error checking admin role by id",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return false;
  }
}
