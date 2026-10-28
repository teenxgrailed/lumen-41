import { Resend } from "resend";

import { APP_NAME } from "@/lib/app-config";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "EmailService";
const EMAIL_LOCAL_PART =
  "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const DOMAIN_LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
const EMAIL_ADDRESS_PATTERN = new RegExp(
  `^(${EMAIL_LOCAL_PART})@(${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+)$`
);
const FORMATTED_MAILBOX_PATTERN = /^([^<>]+?)\s*<([^<>]+)>$/;

function isValidEmailAddress(value: string): boolean {
  if (value.length > 254) return false;
  const match = EMAIL_ADDRESS_PATTERN.exec(value);
  return !!match && match[1].length <= 64 && match[2].length <= 253;
}

function hasUnsafeMailboxCharacters(value: string): boolean {
  return /[\r\n\0]/.test(value);
}

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

/**
 * Sandbox accounts (docs/sandbox-accounts.md) have no inbox anyone reads, so
 * nothing is mailed to one. A lookup that fails sends the mail as before:
 * this only saves a bounce, it guards nothing.
 */
async function isSandboxRecipient(to: string): Promise<boolean> {
  const address = (FORMATTED_MAILBOX_PATTERN.exec(to.trim())?.[2] ?? to)
    .trim()
    .toLowerCase();
  try {
    const user = await prisma.user.findUnique({
      where: { email: address },
      select: { sandboxKind: true },
    });
    return Boolean(user?.sandboxKind);
  } catch {
    return false;
  }
}

/**
 * Email service for sending emails directly in the unified Needt build.
 */
export class EmailService {
  /**
   * Send an email directly using Resend
   * @param emailData The email data to send
   * @returns A promise that resolves when the email is sent
   */
  static async sendEmail(emailData: EmailJobData): Promise<{ jobId: string }> {
    try {
      const { to, subject } = emailData;

      if (await isSandboxRecipient(to)) {
        logger.info("Email to a sandbox account dropped", {}, LOG_SOURCE);
        return { jobId: "" };
      }

      logger.info(
        "Sending email",
        {
          hasAttachments:
            !!emailData.attachments && emailData.attachments.length > 0,
        },
        LOG_SOURCE
      );

      const fromEmail = EmailService.formatSender(APP_NAME);

      const emailToSend = {
        from: fromEmail,
        to,
        subject,
        html: emailData.html,
        text: emailData.text,
      };

      // Add attachments if they exist
      if (emailData.attachments && emailData.attachments.length > 0) {
        const formattedAttachments = emailData.attachments.map(
          (attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            content_type: attachment.contentType,
          })
        );

        Object.assign(emailToSend, { attachments: formattedAttachments });
      }

      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error("RESEND_API_KEY is required to send email");
      }

      const resend = new Resend(resendApiKey);
      const { data, error } = await resend.emails.send(emailToSend);

      if (error) {
        throw new Error(`Resend API error: ${error.message}`);
      }

      logger.info(
        "Email sent successfully",
        {
          resendId: data?.id || null,
        },
        LOG_SOURCE
      );

      return { jobId: data?.id || "" };
    } catch (error) {
      logger.error(
        `Failed to send email`,
        {
          errorType: error instanceof Error ? error.name : "UnknownError",
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Format a sender email address with a display name
   * @param displayName The display name to use
   * @param email Optional custom email address
   * @returns Formatted email string
   */
  static formatSender(displayName: string): string {
    const configuredSender = process.env.RESEND_FROM_EMAIL?.trim();
    if (!configuredSender) {
      throw new Error("RESEND_FROM_EMAIL is required to send email");
    }
    if (
      hasUnsafeMailboxCharacters(configuredSender) ||
      hasUnsafeMailboxCharacters(displayName) ||
      displayName.trim().length === 0 ||
      /[<>]/.test(displayName)
    ) {
      throw new Error("RESEND_FROM_EMAIL must contain one valid mailbox");
    }

    if (isValidEmailAddress(configuredSender)) {
      return `${displayName} <${configuredSender}>`;
    }

    const formattedMailbox = FORMATTED_MAILBOX_PATTERN.exec(configuredSender);
    if (
      formattedMailbox &&
      formattedMailbox[1].trim().length > 0 &&
      !hasUnsafeMailboxCharacters(formattedMailbox[1]) &&
      isValidEmailAddress(formattedMailbox[2].trim())
    ) {
      return `${formattedMailbox[1].trim()} <${formattedMailbox[2].trim()}>`;
    }

    throw new Error("RESEND_FROM_EMAIL must contain one valid mailbox");
  }
}
