/* The two screens a link in a Needt mail opens: "Set a new password"
   (/auth/reset-password?token=…) and "Confirm your email"
   (/auth/confirm-email?email=…&token=…). Pure decisions only, so both faces
   (desktop, phone) and the tests read the same rules. */
import { MIN_PASSWORD } from "./auth-logic";

/** The server's rule for a new password (POST /api/auth/reset-password/reset). */
const PASSWORD_MIX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/;

export type NewPasswordProblem = null | "short" | "mix";

/** What is wrong with a new password, judged the way the server judges it. */
export function newPasswordProblem(pass: string): NewPasswordProblem {
  if (pass.length < MIN_PASSWORD) return "short";
  if (!PASSWORD_MIX.test(pass)) return "mix";
  return null;
}

export const NEW_PASSWORD_HINT =
  "At least 8 characters, with an uppercase letter, a lowercase letter and a number.";

export function newPasswordText(problem: NewPasswordProblem): string {
  if (problem === "short") return "Use at least 8 characters.";
  if (problem === "mix")
    return "Add an uppercase letter, a lowercase letter and a number.";
  return NEW_PASSWORD_HINT;
}

/** Where "Set a new password" is. `set` is the form. */
export type ResetStep = "set" | "saved" | "invalid";

/** What a reset answer means. 400 is the only answer for a bad token. */
export type ResetOutcome = "saved" | "invalid" | "limited" | "error";

export function resetOutcome(status: number): ResetOutcome {
  if (status >= 200 && status < 300) return "saved";
  if (status === 400) return "invalid";
  if (status === 429) return "limited";
  return "error";
}

/** Where "Confirm your email" is. `ready` waits for the press: a mail
    scanner opening the link must not spend the token. */
export type ConfirmStep =
  | "ready"
  | "confirming"
  | "password"
  | "confirmed"
  | "expired"
  | "invalid"
  | "error";

/** What POST /api/auth/email-verification/confirm said. */
export function confirmOutcome(
  ok: boolean,
  status: unknown
): Extract<
  ConfirmStep,
  "confirmed" | "password" | "expired" | "invalid" | "error"
> {
  if (ok && status === "verified") return "confirmed";
  /* Not the browser that signed up: the server wants a new password first and
     has not spent the link. */
  if (ok && status === "password_required") return "password";
  if (status === "expired") return "expired";
  if (status === "error") return "error";
  return "invalid";
}

/** Where a confirmed address goes next: Settings says it, once. */
export const CONFIRMED_NEXT = "/settings?emailVerification=verified";

/**
 * Where "Continue to Needt" goes: the deep link sign-up interrupted (a buy
 * link, say) when one was remembered, else Settings. A remembered Settings
 * link still carries the "Email confirmed" notice.
 */
export function confirmedNext(remembered: string | null): string {
  if (!remembered) return CONFIRMED_NEXT;
  if (!remembered.startsWith("/settings")) return remembered;
  const url = new URL(remembered, "https://needt.invalid");
  url.searchParams.set("emailVerification", "verified");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The resend answer: the server says the same whether or not the address
    has an account, so "sent" is all it can mean. */
export type ResendOutcome = "sent" | "limited" | "error";

export function resendOutcome(status: number): ResendOutcome {
  if (status >= 200 && status < 300) return "sent";
  if (status === 429) return "limited";
  return "error";
}

export const CONFIRM_COPY: Readonly<
  Record<ConfirmStep, { a: string; b: string; line: (mail: string) => string }>
> = {
  ready: {
    a: "Confirm your",
    b: "email",
    line: (mail) => `Confirm ${mail} to start 14 days of Pro.`,
  },
  confirming: {
    a: "Confirm your",
    b: "email",
    line: (mail) => `Confirm ${mail} to start 14 days of Pro.`,
  },
  password: {
    a: "Set a",
    b: "password",
    line: (mail) =>
      `Choose the password for ${mail}. Anything signed in before is signed out.`,
  },
  confirmed: {
    a: "Email",
    b: "confirmed",
    line: (mail) => `${mail} is confirmed. Your 14 days of Pro have started.`,
  },
  expired: {
    a: "This link has",
    b: "expired",
    line: () => "Confirmation links work for a limited time. Send a new one.",
  },
  invalid: {
    a: "This link doesn’t",
    b: "work",
    line: () =>
      "It is incomplete or has already been used. Send a new one if you still need to confirm.",
  },
  error: {
    a: "Confirm your",
    b: "email",
    line: () => "Email confirmation is temporarily unavailable. Try again.",
  },
};
