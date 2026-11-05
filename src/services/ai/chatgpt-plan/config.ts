import { chatGptPlanFlagEnabled } from "@/lib/feature-flags";

/**
 * Sign in with ChatGPT, "ChatGPT plan usage" (docs checked 2026-11-05):
 * https://developers.openai.com/siwc/token-sharing-open-source/sign-in
 *
 * Needt is a hosted, paid app. OpenAI approves those one by one (the interest
 * form), and issues the app its own `client_id`. Until `OPENAI_SIWC_CLIENT_ID`
 * is set the feature does not exist: no route answers, no setting shows.
 */
export const CHATGPT_PLAN_ISSUER = "https://auth.openai.com";
export const CHATGPT_PLAN_AUTHORIZE_URL = `${CHATGPT_PLAN_ISSUER}/api/accounts/authorize`;
export const CHATGPT_PLAN_TOKEN_URL = `${CHATGPT_PLAN_ISSUER}/api/accounts/oauth/token`;
export const CHATGPT_PLAN_DISCOVERY_URL = `${CHATGPT_PLAN_ISSUER}/.well-known/openid-configuration`;
/** The OAuth `resource` and the API the access token is good for. */
export const CHATGPT_PLAN_RESOURCE = "https://api.openai.com/v1";
export const CHATGPT_PLAN_RESPONSES_URL = `${CHATGPT_PLAN_RESOURCE}/responses`;
export const CHATGPT_PLAN_MODELS_URL = `${CHATGPT_PLAN_RESOURCE}/models`;
/** Where the person sees and limits what Needt used of their plan. */
export const CHATGPT_PLAN_MANAGE_USAGE_URL =
  "https://chatgpt.com/settings/usage";

/** The scope that lets the app use the plan. An ID token alone does not. */
export const CHATGPT_PLAN_USE_SCOPE = "chatgpt.tokens.use.direct";
export const CHATGPT_PLAN_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "resource.invoke",
  CHATGPT_PLAN_USE_SCOPE,
] as const;

export interface ChatGptPlanConfig {
  clientId: string;
  /** Only if OpenAI issues the hosted client a secret; the docs name none. */
  clientSecret?: string;
  /** Pins the model; otherwise the first one the account's catalog lists. */
  model?: string;
}

/** Null until the deployment has the client id OpenAI issued. */
export function getChatGptPlanConfig(
  env: Record<string, string | undefined> = process.env
): ChatGptPlanConfig | null {
  const clientId = env.OPENAI_SIWC_CLIENT_ID?.trim();
  if (!clientId) return null;
  return {
    clientId,
    clientSecret: env.OPENAI_SIWC_CLIENT_SECRET?.trim() || undefined,
    model: env.OPENAI_SIWC_MODEL?.trim() || undefined,
  };
}

/** The exact URL registered with OpenAI for this client. */
export function getChatGptPlanRedirectUri(
  env: Record<string, string | undefined> = process.env
): string {
  const appUrl = env.NEXTAUTH_URL?.trim();
  let url: URL;
  try {
    url = new URL(appUrl ?? "");
  } catch {
    throw new Error("NEXTAUTH_URL must be set for ChatGPT plan sign-in");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("NEXTAUTH_URL must be HTTPS for ChatGPT plan sign-in");
  }
  return new URL("/api/ai/chatgpt-plan/callback", url).toString();
}

/**
 * Flag on AND client id configured, for this account. Everything that
 * touches the feature asks this first, so with either missing the feature is
 * invisible rather than half there.
 */
export async function chatGptPlanAvailable(
  userId: string
): Promise<ChatGptPlanConfig | null> {
  const config = getChatGptPlanConfig();
  if (!config) return null;
  if (!(await chatGptPlanFlagEnabled(userId).catch(() => false))) return null;
  return config;
}
