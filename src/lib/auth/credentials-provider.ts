import { compare } from "bcryptjs";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { isPublicSignupEnabled } from "./public-signup";

const LOG_SOURCE = "CredentialsProvider";

/* Precomputed bcrypt hash at cost 12, the cost every real password hash is
   written with (register, email-verification, sandbox). Compared against when
   there is no usable account so a miss costs the same time as a wrong
   password and response time does not reveal which emails have one. If the
   write-side cost changes, regenerate this at the same cost. */
export const DUMMY_HASH =
  "$2a$12$BS4.gxZscgcBDDQ34YsEu.6XJFiyhxqIV3v9GkQEGvh2BO2hG.BcS";

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

    const credentialsAccount = user?.isActive
      ? user.accounts?.find((account) => account.provider === "credentials")
      : undefined;

    // No user, inactive, or no password hash: still run one compare so every
    // path takes a bcrypt's worth of time.
    if (!user || !credentialsAccount || !credentialsAccount.id_token) {
      await compare(password, DUMMY_HASH);
      logger.warn("Authentication failed: No usable account", {}, LOG_SOURCE);
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
