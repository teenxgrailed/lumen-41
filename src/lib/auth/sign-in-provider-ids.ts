/**
 * The third-party sign-in providers Needt knows, in the order the sign-in
 * screen offers them. Safe for client and server: no secrets, no Prisma.
 *
 * Owner decision 2026-10-12: Google, Apple and GitHub are the three buttons
 * every sign-in screen shows; the rest sit behind "More ways to sign in". A
 * provider appears only when the server has it configured (its client id and
 * secret are set), so this list is what CAN appear, never what does.
 *
 * The id is NextAuth's provider id, and so also the last segment of the
 * callback URL: `<NEXTAUTH_URL>/api/auth/callback/<id>`.
 */
export const SIGN_IN_PROVIDERS = [
  { id: "google", label: "Google", main: true },
  { id: "apple", label: "Apple", main: true },
  { id: "github", label: "GitHub", main: true },
  { id: "azure-ad", label: "Microsoft", main: false },
  { id: "openai", label: "ChatGPT", main: false },
  { id: "discord", label: "Discord", main: false },
  { id: "twitter", label: "X", main: false },
  { id: "linkedin", label: "LinkedIn", main: false },
] as const;

export type SignInProviderId = (typeof SIGN_IN_PROVIDERS)[number]["id"];

export const SIGN_IN_PROVIDER_IDS: readonly SignInProviderId[] =
  SIGN_IN_PROVIDERS.map((p) => p.id);

export const MAIN_SIGN_IN_PROVIDER_IDS: readonly SignInProviderId[] =
  SIGN_IN_PROVIDERS.filter((p) => p.main).map((p) => p.id);

export function isSignInProviderId(id: unknown): id is SignInProviderId {
  return (
    typeof id === "string" &&
    (SIGN_IN_PROVIDER_IDS as readonly string[]).includes(id)
  );
}

/** The provider's name as people know it ("Microsoft", not "Azure AD"). */
export function signInProviderLabel(id: string): string {
  return SIGN_IN_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
