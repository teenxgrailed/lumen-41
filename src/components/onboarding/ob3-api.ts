import { browserLocale } from "@/lib/needt3/locale-defaults";
import type { OnboardingAnswers } from "@/lib/onboarding/answers";
import type { WeekPlan } from "@/lib/onboarding/plan";
import type { CommitResult } from "@/lib/onboarding/server";

/* The onboarding talks to the same public API anyone can call. Nothing the
   screens know is kept anywhere an API client cannot reach. */

export const browserZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(
      typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`
    ) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = typeof body.code === "string" ? body.code : undefined;
    throw err;
  }
  return body as T;
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export async function fetchPlan(
  answers: OnboardingAnswers,
  seed: number
): Promise<WeekPlan> {
  const res = await post("/api/onboarding/plan", {
    answers,
    seed,
    timeZone: browserZone(),
  });
  return (await json<{ plan: WeekPlan }>(res)).plan;
}

export async function saveAnswersRemote(answers: OnboardingAnswers) {
  const res = await fetch("/api/onboarding/answers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, timeZone: browserZone() }),
  });
  await json(res);
}

export async function commitWeek(answers: OnboardingAnswers) {
  const res = await post("/api/onboarding/commit", {
    answers,
    timeZone: browserZone(),
  });
  return json<CommitResult>(res);
}

export async function startGift(): Promise<
  { started: true; endsAt: string } | { started: false; used: boolean }
> {
  const res = await post("/api/billing/trial", {});
  if (res.ok) {
    const b = (await res.json()) as { trialEndsAt: string };
    return { started: true, endsAt: b.trialEndsAt };
  }
  const b = (await res.json().catch(() => ({}))) as { code?: string };
  return { started: false, used: b.code === "TRIAL_USED" };
}

export async function checkoutAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/billing/checkout");
    if (!res.ok) return false;
    return Boolean(((await res.json()) as { available?: boolean }).available);
  } catch {
    return false;
  }
}

export async function startCheckout(
  plan: "pro" | "lifetime",
  interval: "month" | "year"
): Promise<string> {
  const res = await post("/api/billing/checkout", {
    plan,
    from: "onboarding",
    ...(plan === "pro" ? { interval } : {}),
  });
  return (await json<{ url: string }>(res)).url;
}

export async function signInProviders(): Promise<string[]> {
  try {
    const res = await fetch("/api/auth/providers");
    if (!res.ok) return [];
    return Object.keys((await res.json()) as Record<string, unknown>);
  } catch {
    return [];
  }
}

export async function publicSignupOpen(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/public-signup");
    return Boolean(((await res.json()) as { enabled?: boolean }).enabled);
  } catch {
    return false;
  }
}

export async function registerEmail(
  email: string,
  password: string,
  name: string
) {
  // The account starts in the browser's zone, week and clock, not UTC.
  const res = await post("/api/auth/register", {
    email,
    password,
    ...(name ? { name } : {}),
    ...browserLocale(),
  });
  await json(res);
}

export async function emailVerified(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/email-verification/status");
    if (!res.ok) return false;
    return Boolean(((await res.json()) as { verified?: boolean }).verified);
  } catch {
    return false;
  }
}

export async function resendVerification() {
  const res = await post("/api/auth/email-verification/request", {});
  await json(res);
}
