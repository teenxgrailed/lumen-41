/**
 * Rules of the "sign in with a code" flow that need no DOM: how a typed or
 * pasted code is read, and the words for each way it can end.
 */
import { validMail } from "./auth-logic";

export const CODE_LENGTH = 6;
/** Seconds before "send it again" works; the server limits to the same. */
export const RESEND_SECONDS = 60;

/** Keeps the digits of what was typed or pasted ("123 456", "123-456"). */
export function codeDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function codeComplete(code: string): boolean {
  return code.length === CODE_LENGTH;
}

export type SendAnswer = "sent" | "limited" | "invalid" | "network";
export type VerifyAnswer = "ok" | "wrong" | "age" | "network";

export interface EmailCodeApi {
  /** Mails a code. The server answers the same for every address. */
  send: (email: string) => Promise<SendAnswer>;
  /** Signs in (or creates the account) with the code. */
  verify: (input: {
    email: string;
    code: string;
    ageConfirmed: boolean;
  }) => Promise<VerifyAnswer>;
  /** The old email + password form is open instead of the code. */
  usePassword: boolean;
  setUsePassword: (value: boolean) => void;
}

export function canSendCode(mail: string): boolean {
  return validMail(mail.trim());
}

export const CODE_TEXT = {
  sendLabel: "Send code",
  sending: "Sending…",
  verifyLabel: (signup: boolean) => (signup ? "Create account" : "Sign in"),
  verifying: "Checking…",
  wrong: "That code didn’t work. Check it, or send a new one.",
  limited: "Too many requests, try again later",
  invalidMail: "Enter a valid email address.",
  needAge:
    "New here? Tick the box above to create your account, then use the same code.",
  usePassword: "Use password",
  useCode: "Use a code instead",
  differentEmail: "Use a different email",
  net: "Couldn’t reach Needt — check your connection",
} as const;

export function codeSentLine(mail: string): string {
  return `If ${mail} can sign in, a ${CODE_LENGTH}-digit code is on its way. It works for 10 minutes.`;
}
