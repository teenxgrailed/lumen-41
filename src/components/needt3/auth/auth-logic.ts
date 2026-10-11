/**
 * Sign-in rules that do not need a DOM (prototype AuthScreen.jsx): what is
 * wrong with the fields, and what the submit button says.
 */
export type AuthMode = "login" | "signup";

export const MIN_PASSWORD = 8;

export interface AuthFields {
  mail: string;
  pass: string;
  /** The person has pressed Continue at least once. */
  touched: boolean;
}

/** "Include an @ in the address." only once there is something to judge. */
export function mailProblem(
  f: Pick<AuthFields, "mail" | "touched">
): "empty" | "shape" | null {
  if (!f.touched) return null;
  if (f.mail.length === 0) return "empty";
  return f.mail.indexOf("@") < 1 ? "shape" : null;
}

export function mailProblemText(p: "empty" | "shape" | null): string | null {
  return p === "empty"
    ? "Enter your email."
    : p === "shape"
      ? "Include an @ in the address."
      : null;
}

/** Too short only after something has been typed. */
export function passwordShort(pass: string): boolean {
  return pass.length > 0 && pass.length < MIN_PASSWORD;
}

export function validMail(mail: string): boolean {
  return mail.length > 0 && mail.indexOf("@") >= 1;
}

export type SubmitStep = "ask-mail" | "ask-password" | "ready";

/**
 * Craft asks for the address first; the password arrives under it once the
 * address is in. Returns what pressing the button does next.
 */
export function submitStep(f: {
  mail: string;
  pass: string;
  withPass: boolean;
}): SubmitStep {
  if (!validMail(f.mail)) return "ask-mail";
  if (!f.withPass) return "ask-password";
  if (f.pass.length < MIN_PASSWORD) return "ask-password";
  return "ready";
}

export function submitLabel(
  mode: AuthMode,
  withPass: boolean,
  busy: boolean
): string {
  if (busy) return "Setting up your day…";
  if (!withPass) return "Continue";
  return mode === "signup" ? "Create account" : "Sign in";
}

/** The wording of each way a server can say no. */
export function refusalText(
  reason: "taken" | "wrong" | null,
  message?: string | null
): string | null {
  if (message) return message;
  if (reason === "taken")
    return "That address already has an account. Sign in instead.";
  if (reason === "wrong") return "That email and password do not match.";
  return null;
}

/** The recovery link's resend countdown, "0:07". */
export function resendClock(seconds: number): string {
  return "0:" + String(Math.max(0, seconds)).padStart(2, "0");
}

/**
 * The line shown instead of "Create one" while public sign-up is closed
 * (FeatureFlag `signups_open`, read from /api/auth/public-signup): new people
 * join the waitlist on the marketing site. Desktop and phone share it.
 */
export const WAITLIST = {
  lead: "New here? Join the waitlist at ",
  host: "needt.app",
  href: "https://needt.app",
} as const;

/** The waitlist line belongs to sign-in only, and only once the answer is in. */
export function showWaitlist(a: {
  mode: AuthMode;
  /** The sign-up switch answered "closed" (not: has not answered yet). */
  signupClosed: boolean;
}): boolean {
  return a.signupClosed && a.mode === "login";
}

/** The phone shows both fields at once, so its button is never "Continue". */
export function phoneSubmitLabel(mode: AuthMode, busy: boolean): string {
  if (busy) return mode === "signup" ? "Creating…" : "Signing in…";
  return mode === "signup" ? "Create the account" : "Sign in";
}

/** The sentence under a network failure. */
export function netFailureText(a: { recover: boolean; signup: boolean }) {
  return a.recover
    ? "Couldn’t send the link — check your connection"
    : a.signup
      ? "Couldn’t create your account — check your connection"
      : "Couldn’t sign in — check your connection";
}

/** Both fields are good enough to send. */
export function formReady(f: { mail: string; pass: string }): boolean {
  return validMail(f.mail) && f.pass.length >= MIN_PASSWORD;
}
