import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { PrismaAdapter } from "@auth/prisma-adapter";

import {
  accountLinkingGate,
  normalizeEmail,
  verifiedProviderEmail,
  withCaseInsensitiveEmailLookup,
} from "@/lib/auth/account-linking";
import { authSecret } from "@/lib/auth/auth-secret";
import { authenticateUser } from "@/lib/auth/credentials-provider";
import { withEncryptedAccountTokens } from "@/lib/auth/encrypting-adapter";
import {
  enforceSessionVersion,
  issueSessionVersion,
} from "@/lib/auth/session-version";
import {
  buildSignInProviders,
  crossSiteCallbackCookies,
  isProviderConfigured,
  readSignInProviderConfig,
} from "@/lib/auth/sign-in-providers";
import { oauthSignInGate } from "@/lib/auth/signups";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { ONBOARDING_RESUME_PATH } from "@/lib/onboarding/paths";
import { prisma } from "@/lib/prisma";
import { markEmailVerifiedAndStartTrial } from "@/lib/trials/trial-service";

// Define a type for our user with role
interface UserWithRole {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  role?: string;
}

const LOG_SOURCE = "AuthOptions";

/* Owner decision: a session lasts 30 days and slides. With the JWT strategy
   NextAuth re-issues the cookie with a fresh 30-day expiry on every session
   read (each /api/auth/session call from the client), so an active person
   stays signed in and a device left idle for 30 days is signed out.
   `updateAge` only throttles database sessions; it is set for clarity. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/**
 * Where a brand-new account lands: the resolver that picks `/start` or
 * `/setup` per user from the `onboarding_v3` flag.
 */
export const NEW_ACCOUNT_PATH = ONBOARDING_RESUME_PATH;

// Create a function to get the auth options with the credentials
export async function getAuthOptions(): Promise<NextAuthOptions> {
  // Each provider's credentials: System Settings first, then the environment.
  const providerConfig = await readSignInProviderConfig();

  const providers: NextAuthOptions["providers"] = [
    // Add credentials provider for email/password authentication
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          logger.warn("Missing credentials", {}, LOG_SOURCE);
          return null;
        }

        try {
          const user = await authenticateUser(
            credentials.email,
            credentials.password
          );
          return user;
        } catch (error) {
          logger.error(
            "Error in credentials authorization",
            {
              error: error instanceof Error ? error.message : "Unknown error",
            },
            LOG_SOURCE
          );
          return null;
        }
      },
    }),
  ];

  /* Third-party sign-in: only the providers that are configured. */
  providers.unshift(...buildSignInProviders(providerConfig));

  return {
    adapter: withCaseInsensitiveEmailLookup(
      withEncryptedAccountTokens(
        PrismaAdapter(prisma) as NonNullable<NextAuthOptions["adapter"]>
      )
    ),
    // Add secret for production - required for security
    secret: authSecret(),

    providers,
    callbacks: {
      async signIn({ user, account, profile }) {
        /* A provider identity joins an existing account only on an email
           the provider verified (account-linking.ts); X never joins. */
        const link = await accountLinkingGate({
          provider: account?.provider,
          providerAccountId: account?.providerAccountId,
          profile: profile as Record<string, unknown> | undefined,
        });
        if (link !== true) return link;
        /* Registration is closed until launch: an OAuth return that would
           create a user goes back to sign-in instead of into the adapter.
           The same gate covers every provider. */
        return oauthSignInGate({
          provider: account?.provider,
          providerAccountId: account?.providerAccountId,
          email: user.email,
        });
      },
      // This branch's jwt supersedes main's: it keeps token.sub and the role
      // instead of early-returning a fresh token object that dropped both.
      async jwt({ token: incoming, account, user, profile }) {
        let token = incoming;
        // Sessions issued before the provider tokens were dropped still carry
        // them; strip them so they stop riding along in the cookie.
        const legacy = token as Record<string, unknown>;
        delete legacy.accessToken;
        delete legacy.refreshToken;

        if (user) {
          token.sub = user.id;
          token.role = (user as UserWithRole).role;
          token = await issueSessionVersion(token, user.id);
        } else {
          // Throws once the person signed out everywhere; see session-version.
          token = await enforceSessionVersion(token);
        }

        // Initial sign in. The provider's OAuth tokens are deliberately not
        // copied into the JWT: the session callback would hand them to the
        // browser via /api/auth/session, and nothing in Needt uses them.
        if (account) {
          token.expiresAt = account.expires_at;
          token.provider = account.provider;
          if (account.type === "oauth" && user?.id) {
            /* Fresh proof of identity for account re-authentication. By id:
               an X account may have no email at all. */
            await prisma.user.updateMany({
              where: { id: user.id },
              data: { lastAuthenticatedAt: newDate() },
            });
          }
          if (account.type === "oauth" && user?.id && user.email) {
            /* Confirmed only when the provider itself vouches for this very
               address (email_verified and the like). Otherwise the person
               confirms by mail like everyone else. */
            const vouched = verifiedProviderEmail(
              account.provider,
              profile as Record<string, unknown> | undefined
            );
            if (vouched && vouched === normalizeEmail(user.email)) {
              await markEmailVerifiedAndStartTrial({
                userId: user.id,
                email: user.email,
              });
            }
            await prisma.userSettings.upsert({
              where: { userId: user.id },
              update: {},
              create: { userId: user.id, theme: "dark", timeZone: "UTC" },
            });
            await prisma.autoScheduleSettings.upsert({
              where: { userId: user.id },
              update: {},
              create: {
                userId: user.id,
                workDays: "[1,2,3,4,5]",
                workHourStart: 9,
                workHourEnd: 17,
                bufferMinutes: 15,
              },
            });
          }
        }

        return token;
      },
      async session({ session, token }) {
        // Add user role to the session
        if (session.user) {
          session.user.id = token.sub;
          session.user.role = token.role;
        }

        return {
          ...session,
          expiresAt: token.expiresAt,
          provider: token.provider,
        };
      },
    },
    pages: {
      signIn: "/auth/signin",
      error: "/auth/signin",
      /* An OAuth return that just created the account goes to onboarding
         (`/start` or `/setup`, by flag), as a credentials sign-up does. A
         returning person never sees it: NextAuth only uses this when the
         adapter created the user on this very callback. */
      newUser: NEW_ACCOUNT_PATH,
    },
    /* Apple's form_post callback needs the PKCE, state and nonce cookies
       sent cross-site; see crossSiteCallbackCookies. */
    ...(isProviderConfigured("apple", providerConfig)
      ? { cookies: crossSiteCallbackCookies(process.env.NEXTAUTH_URL) }
      : {}),
    debug: process.env.NODE_ENV === "development",
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    // The sign-in callback encodes with jwt.maxAge, the session route with
    // session.maxAge; keep both on the same 30 days.
    jwt: {
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}
