import { createHash } from "node:crypto";

/**
 * A password-reset token is emailed once and stored only as its sha256, like
 * connector and email-verification tokens, so a read of the table cannot be
 * replayed as a reset link. `PasswordReset.token` holds this hash.
 */
export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
