import { compare } from "bcryptjs";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { isPublicSignupEnabled } from "./public-signup";

const LOG_SOURCE = "CredentialsProvider";

/**
 * Authenticates a user with email and password
 * @param email User's email
 * @param password User's password
 * @returns User object if authentication is successful, null otherwise
 */
export async function authenticateUser(email: string, password: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        accounts: {
          where: {
            provider: "credentials",
          },
        },
      },
    });

    // If user doesn't exist, return null
    if (
      !user ||
      !user.isActive ||
      !user.accounts ||
      user.accounts.length === 0
    ) {
      logger.warn("Authentication failed: User not found", {}, LOG_SOURCE);
      return null;
    }

    // Get the credentials account
    const credentialsAccount = user.accounts.find(
      (account) => account.provider === "credentials"
    );

    // If no credentials account exists, return null
    if (!credentialsAccount || !credentialsAccount.id_token) {
      logger.warn(
        "Authentication failed: No credentials account found",
        {},
        LOG_SOURCE
      );
      return null;
    }

    // Compare the provided password with the stored hash
    const passwordMatch = await compare(password, credentialsAccount.id_token);

    if (!passwordMatch) {
      logger.warn("Authentication failed: Invalid password", {}, LOG_SOURCE);
      return null;
    }

    /* An unconfirmed account may sign in: sign-up signs the person straight in
       and waits on the "Check your inbox" screen. What it cannot do is use the
       app or the API; the (app) layout and api-auth refuse it until the email
       is confirmed (email-verification-access.ts). */
    // Recorded only once the sign-in is actually going to succeed; a blocked
    // attempt must not count as proof of identity for reauthentication.
    await prisma.user.update({
      where: { id: user.id },
      data: { lastAuthenticatedAt: newDate() },
    });

    logger.info(
      "User authenticated successfully",
      { userId: user.id },
      LOG_SOURCE
    );

    // Return the user without the accounts
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accounts, ...userWithoutAccounts } = user;
    return userWithoutAccounts;
  } catch (error) {
    logger.error(
      "Error authenticating user",
      {
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      LOG_SOURCE
    );
    return null;
  }
}

/**
 * Checks if public signup is enabled
 * @returns Whether public signup is enabled
 */
export async function canSignUp() {
  return await isPublicSignupEnabled();
}
