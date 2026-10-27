import { logger } from "@/lib/logger";

import { EmailService } from "./email-service";
import { getPasswordResetTemplate } from "./templates/password-reset";

const LOG_SOURCE = "PasswordResetEmail";

interface SendPasswordResetEmailProps {
  email: string;
  name: string;
  resetToken: string;
  expirationDate: Date;
}

/**
 * Sends a password reset email to a user
 */
export async function sendPasswordResetEmail({
  email,
  name,
  resetToken,
  expirationDate,
}: SendPasswordResetEmailProps) {
  try {
    // Generate the reset link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/auth/reset-password?token=${resetToken}`;

    // Get the email template
    const template = getPasswordResetTemplate(name, resetLink, expirationDate);

    // Send the email using the appropriate service
    const { jobId } = await EmailService.sendEmail({
      to: email,
      ...template,
    });

    logger.info("Password reset email sent", { jobId }, LOG_SOURCE);

    return { success: true, jobId };
  } catch (error) {
    logger.error(
      "Failed to send password reset email",
      {
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      LOG_SOURCE
    );

    throw error;
  }
}
