import type { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import AppleProvider from "next-auth/providers/apple";
import AzureADProvider from "next-auth/providers/azure-ad";
import DiscordProvider from "next-auth/providers/discord";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import TwitterProvider from "next-auth/providers/twitter";

import { createPrivateKey, sign } from "node:crypto";

import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";
import { verifiedProviderEmail } from "@/lib/auth/account-linking";
import type { SignInProviderId } from "@/lib/auth/sign-in-provider-ids";
import { newDate } from "@/lib/date-utils";
import { GOOGLE_SIGN_IN_SCOPES } from "@/lib/google-oauth-scopes";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { openSystemSettingsSecrets } from "@/lib/system-settings-secrets";

const LOG_SOURCE = "SignInProviders";

/**
 * Every third-party sign-in provider: where its credentials come from, the
 * scopes it asks for and how its profile becomes a Needt user. Setup steps for
 * each console: docs/operations/sign-in-providers.md.
 *
 * Scopes are the minimum that yields an id, a name and an email. Sign-in never
 * asks for calendar, mail or task access; those are granted per account in
 * Connections. The ChatGPT client asks for identity only (no plan-usage
 * scopes).
 */
export const SIGN_IN_SCOPES = {
  google: GOOGLE_SIGN_IN_SCOPES.join(" "),
  "azure-ad": "openid profile email User.Read",
  apple: "name email",
  github: "read:user user:email",
  discord: "identify email",
  twitter: "users.read tweet.read",
  linkedin: "openid profile email",
  openai: "openid profile email",
} as const satisfies Record<SignInProviderId, string>;

interface ClientPair {
  clientId: string;
  clientSecret: string;
}

export interface SignInProviderConfig {
  google: ClientPair;
  "azure-ad": ClientPair & { tenantId: string };
  apple: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string;
  };
  github: ClientPair;
  discord: ClientPair;
  twitter: ClientPair;
  linkedin: ClientPair;
  /** OpenAI also issues public clients, which have no secret. */
  openai: ClientPair;
}

const env = (name: string) => process.env[name]?.trim() || "";
const pick = (stored: unknown, envName: string) =>
  (typeof stored === "string" && stored.trim()) || env(envName);

/**
 * Credentials for every provider: the System Settings value when set (secrets
 * decrypted), else the environment variable. Google and Microsoft keep their
 * existing readers, which the Connections flows share.
 */
export async function readSignInProviderConfig(): Promise<SignInProviderConfig> {
  const [google, outlook] = await Promise.all([
    getGoogleCredentials(),
    getOutlookCredentials(),
  ]);

  let stored: Record<string, unknown> = {};
  if (process.env.DATABASE_URL) {
    try {
      const row = await prisma.systemSettings.findFirst();
      if (row) stored = openSystemSettingsSecrets(row);
    } catch (error) {
      logger.error(
        "Failed to read sign-in provider settings",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
    }
  }

  return {
    google: {
      clientId: google.clientId || "",
      clientSecret: google.clientSecret || "",
    },
    "azure-ad": {
      clientId: outlook.clientId || "",
      clientSecret: outlook.clientSecret || "",
      tenantId: outlook.tenantId || "",
    },
    apple: {
      clientId: pick(stored.appleClientId, "APPLE_CLIENT_ID"),
      teamId: pick(stored.appleTeamId, "APPLE_TEAM_ID"),
      keyId: pick(stored.appleKeyId, "APPLE_KEY_ID"),
      privateKey: pick(stored.applePrivateKey, "APPLE_PRIVATE_KEY"),
    },
    github: {
      clientId: pick(stored.githubClientId, "GITHUB_CLIENT_ID"),
      clientSecret: pick(stored.githubClientSecret, "GITHUB_CLIENT_SECRET"),
    },
    discord: {
      clientId: pick(stored.discordClientId, "DISCORD_CLIENT_ID"),
      clientSecret: pick(stored.discordClientSecret, "DISCORD_CLIENT_SECRET"),
    },
    twitter: {
      clientId: pick(stored.twitterClientId, "TWITTER_CLIENT_ID"),
      clientSecret: pick(stored.twitterClientSecret, "TWITTER_CLIENT_SECRET"),
    },
    linkedin: {
      clientId: pick(stored.linkedinClientId, "LINKEDIN_CLIENT_ID"),
      clientSecret: pick(stored.linkedinClientSecret, "LINKEDIN_CLIENT_SECRET"),
    },
    openai: {
      clientId: pick(stored.openaiSiwcClientId, "OPENAI_SIWC_CLIENT_ID"),
      clientSecret: pick(
        stored.openaiSiwcClientSecret,
        "OPENAI_SIWC_CLIENT_SECRET"
      ),
    },
  };
}

/** Whether a provider has everything it needs; anything less hides it. */
export function isProviderConfigured(
  id: SignInProviderId,
  config: SignInProviderConfig
): boolean {
  switch (id) {
    case "apple": {
      const a = config.apple;
      return !!(a.clientId && a.teamId && a.keyId && a.privateKey);
    }
    case "azure-ad": {
      const m = config["azure-ad"];
      return !!(m.clientId && m.clientSecret && m.tenantId);
    }
    case "openai":
      return !!config.openai.clientId;
    default:
      return !!(config[id].clientId && config[id].clientSecret);
  }
}

/* ---------- Apple: the client secret is a JWT signed with the .p8 key ---------- */

/** Apple refuses a client secret that lives longer than six months. */
export const APPLE_SECRET_MAX_SECONDS = 15_777_000;
/** We sign one for 30 days and replace it daily, far inside that limit. */
const APPLE_SECRET_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const APPLE_SECRET_REFRESH_SECONDS = 24 * 60 * 60;

/**
 * The .p8 key as PEM, however it was pasted: with real newlines, with `\n`
 * escapes (an env file), flattened to one line (a password field drops
 * newlines), or as the bare base64 body.
 */
export function normalizeApplePrivateKey(raw: string): string {
  const body = raw
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

const b64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

/**
 * The ES256 client secret Apple's token endpoint expects
 * (https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret).
 */
export function signAppleClientSecret(
  apple: SignInProviderConfig["apple"],
  nowSeconds: number
): string {
  const header = { alg: "ES256", kid: apple.keyId, typ: "JWT" };
  const payload = {
    iss: apple.teamId,
    iat: nowSeconds,
    exp: nowSeconds + APPLE_SECRET_LIFETIME_SECONDS,
    aud: "https://appleid.apple.com",
    sub: apple.clientId,
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(input), {
    key: createPrivateKey(normalizeApplePrivateKey(apple.privateKey)),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${b64url(signature)}`;
}

let appleSecretCache: { key: string; issuedAt: number; secret: string } | null =
  null;

/** The current Apple client secret, re-signed once a day. */
export function appleClientSecret(apple: SignInProviderConfig["apple"]) {
  const now = Math.floor(newDate().getTime() / 1000);
  const key = [
    apple.clientId,
    apple.teamId,
    apple.keyId,
    apple.privateKey,
  ].join("|");
  if (
    appleSecretCache?.key === key &&
    now - appleSecretCache.issuedAt < APPLE_SECRET_REFRESH_SECONDS
  ) {
    return appleSecretCache.secret;
  }
  const secret = signAppleClientSecret(apple, now);
  appleSecretCache = { key, issuedAt: now, secret };
  return secret;
}

/* ---------- Providers ---------- */

type AnyOAuth = OAuthConfig<Record<string, unknown>>;

/**
 * The user NextAuth creates or looks up carries only an email the provider
 * vouches for (`verifiedProviderEmail`); an unverified address is dropped, so
 * it can neither find an existing account nor be stored as if confirmed.
 */
function withVerifiedEmail(id: SignInProviderId, provider: AnyOAuth): AnyOAuth {
  const base = provider.profile;
  return {
    ...provider,
    async profile(raw, tokens) {
      const user = await base(raw, tokens);
      return { ...user, email: verifiedProviderEmail(id, raw) };
    },
  };
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/** GitHub's primary address, only when GitHub has verified it. */
export async function githubVerifiedPrimaryEmail(
  accessToken: string
): Promise<string | null> {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Needt",
    },
  });
  if (!response.ok) return null;
  const emails = (await response.json()) as GitHubEmail[];
  return (
    (Array.isArray(emails) &&
      emails.find((e) => e.primary && e.verified)?.email) ||
    null
  );
}

function linkedInProvider(pair: ClientPair): AnyOAuth {
  /* NextAuth v4's LinkedIn provider still calls the retired v2 profile API;
     this is LinkedIn's OpenID Connect sign-in ("Sign In with LinkedIn using
     OpenID Connect" product). */
  return {
    id: "linkedin",
    name: "LinkedIn",
    type: "oauth",
    wellKnown:
      "https://www.linkedin.com/oauth/.well-known/openid-configuration",
    issuer: "https://www.linkedin.com/oauth",
    jwks_endpoint: "https://www.linkedin.com/oauth/openid/jwks",
    authorization: { params: { scope: SIGN_IN_SCOPES.linkedin } },
    idToken: true,
    checks: ["state"],
    client: { token_endpoint_auth_method: "client_secret_post" },
    clientId: pair.clientId,
    clientSecret: pair.clientSecret,
    allowDangerousEmailAccountLinking: true,
    profile(profile) {
      return {
        id: String(profile.sub),
        name: (profile.name as string | undefined) ?? null,
        email: (profile.email as string | undefined) ?? null,
        image: (profile.picture as string | undefined) ?? null,
      };
    },
  };
}

function openAiProvider(pair: ClientPair): AnyOAuth {
  /* Sign in with ChatGPT: OpenID Connect, authorization code + PKCE, with
     state and nonce (https://developers.openai.com/siwc/website). A
     confidential client authenticates with client_secret_basic; a public one
     with none. Identity scopes only. */
  return {
    id: "openai",
    name: "ChatGPT",
    type: "oauth",
    wellKnown: "https://auth.openai.com/.well-known/openid-configuration",
    authorization: { params: { scope: SIGN_IN_SCOPES.openai } },
    idToken: true,
    checks: ["pkce", "state", "nonce"],
    client: {
      token_endpoint_auth_method: pair.clientSecret
        ? "client_secret_basic"
        : "none",
    },
    clientId: pair.clientId,
    ...(pair.clientSecret ? { clientSecret: pair.clientSecret } : {}),
    allowDangerousEmailAccountLinking: true,
    profile(profile) {
      return {
        id: String(profile.sub),
        name: (profile.name as string | undefined) ?? null,
        email: (profile.email as string | undefined) ?? null,
        image: (profile.picture as string | undefined) ?? null,
      };
    },
  };
}

/**
 * The NextAuth providers for whatever is configured, nothing else.
 *
 * `allowDangerousEmailAccountLinking` is set on every provider that may join
 * an existing account. It is not dangerous here: the `signIn` callback runs
 * `accountLinkingGate` first and refuses any join without a verified matching
 * email, and the profile carries only a verified email. X keeps NextAuth's
 * default (never link) as a second lock.
 */
export function buildSignInProviders(
  config: SignInProviderConfig
): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];
  const on = (id: SignInProviderId) => isProviderConfigured(id, config);

  if (on("google")) {
    providers.push(
      withVerifiedEmail(
        "google",
        GoogleProvider({
          ...config.google,
          allowDangerousEmailAccountLinking: true,
          authorization: { params: { scope: SIGN_IN_SCOPES.google } },
        }) as AnyOAuth
      )
    );
  }

  if (on("apple")) {
    try {
      providers.push(
        withVerifiedEmail(
          "apple",
          AppleProvider({
            clientId: config.apple.clientId,
            clientSecret: appleClientSecret(config.apple),
            allowDangerousEmailAccountLinking: true,
          }) as AnyOAuth
        )
      );
    } catch (error) {
      /* A malformed key must not take every other way in down with it. */
      logger.error(
        "Apple sign-in is configured but its key could not sign",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
    }
  }

  if (on("github")) {
    providers.push(
      withVerifiedEmail(
        "github",
        GitHubProvider({
          ...config.github,
          allowDangerousEmailAccountLinking: true,
          authorization: { params: { scope: SIGN_IN_SCOPES.github } },
          userinfo: {
            url: "https://api.github.com/user",
            async request({ client, tokens }) {
              const profile = (await client.userinfo(
                tokens.access_token as string
              )) as Record<string, unknown>;
              profile.verified_primary_email = await githubVerifiedPrimaryEmail(
                tokens.access_token as string
              );
              return profile;
            },
          },
        }) as unknown as AnyOAuth
      )
    );
  }

  if (on("azure-ad")) {
    providers.push(
      withVerifiedEmail(
        "azure-ad",
        AzureADProvider({
          ...config["azure-ad"],
          allowDangerousEmailAccountLinking: true,
          authorization: { params: { scope: SIGN_IN_SCOPES["azure-ad"] } },
        }) as AnyOAuth
      )
    );
  }

  if (on("openai")) {
    providers.push(withVerifiedEmail("openai", openAiProvider(config.openai)));
  }

  if (on("discord")) {
    providers.push(
      withVerifiedEmail(
        "discord",
        DiscordProvider({
          ...config.discord,
          allowDangerousEmailAccountLinking: true,
        }) as unknown as AnyOAuth
      )
    );
  }

  if (on("twitter")) {
    providers.push(
      TwitterProvider({
        ...config.twitter,
        version: "2.0",
        authorization: {
          url: "https://twitter.com/i/oauth2/authorize",
          params: { scope: SIGN_IN_SCOPES.twitter },
        },
      }) as unknown as AnyOAuth
    );
  }

  if (on("linkedin")) {
    providers.push(
      withVerifiedEmail("linkedin", linkedInProvider(config.linkedin))
    );
  }

  return providers;
}

/**
 * Apple returns to the callback with a cross-site form POST, which does not
 * carry SameSite=Lax cookies, so the PKCE verifier, state, nonce and return
 * address NextAuth set before leaving would be missing. Over HTTPS those four
 * short-lived cookies are sent as SameSite=None; Secure instead. The session
 * and CSRF cookies keep NextAuth's defaults.
 */
export function crossSiteCallbackCookies(
  baseUrl: string | undefined
): NextAuthOptions["cookies"] | undefined {
  if (!baseUrl?.startsWith("https://")) return undefined;
  const options = (maxAge?: number) => ({
    httpOnly: true,
    sameSite: "none" as const,
    path: "/",
    secure: true,
    ...(maxAge ? { maxAge } : {}),
  });
  return {
    pkceCodeVerifier: {
      name: "__Secure-next-auth.pkce.code_verifier",
      options: options(60 * 15),
    },
    state: { name: "__Secure-next-auth.state", options: options(60 * 15) },
    nonce: { name: "__Secure-next-auth.nonce", options: options() },
    callbackUrl: {
      name: "__Secure-next-auth.callback-url",
      options: options(),
    },
  };
}
