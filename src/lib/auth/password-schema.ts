import { z } from "zod";

/**
 * The one rule for a new password, shared by sign-up, reset and the
 * confirm-email screen. Sign-up only ever asked for 8 characters, so a stricter
 * reset rule would lock out people who registered under it.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "Password must be at least 8 characters")
  .max(MAX_PASSWORD_LENGTH, "Password must be at most 128 characters");
