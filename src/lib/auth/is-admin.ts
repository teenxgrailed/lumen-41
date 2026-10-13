import { getServerSession } from "next-auth";
import { Session } from "next-auth";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { requiresEmailVerificationBeforeAccess } from "@/lib/auth/email-verification-access";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminCheck";

/**
 * Checks if the current user is an admin
 * @returns {Promise<boolean>} Whether the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      logger.info(
        "No session found when checking admin status",
        {},
        LOG_SOURCE
      );
      return false;
    }

    if (!session.user.email) {
      logger.info(
        "Session without email cannot be authorized as admin",
        {},
        LOG_SOURCE
      );
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { emailVerified: true, isActive: true, role: true },
    });
    const verificationRequired = await requiresEmailVerificationBeforeAccess();
    const isUserAdmin =
      user?.isActive === true &&
      user.role === "admin" &&
      (!verificationRequired || Boolean(user.emailVerified));
    logger.info(
      "Checked if user is admin",
      { isAdmin: isUserAdmin, userIsActive: user?.isActive ?? false },
      LOG_SOURCE
    );

    return isUserAdmin;
  } catch (error) {
    logger.error(
      "Error checking if user is admin",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return false;
  }
}

/**
 * Client-side hook to check if the current user is an admin
 * This should be used in client components
 * @param session The session object from the shared app session provider
 * @returns {boolean} Whether the current user is an admin
 */
export function isAdminFromSession(session: Session | null): boolean {
  return session?.user?.role === "admin";
}
