import { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { PrismaAdapter } from "@auth/prisma-adapter";

import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";
import { authSecret } from "@/lib/auth/auth-secret";
import { authenticateUser } from "@/lib/auth/credentials-provider";
import { withEncryptedAccountTokens } from "@/lib/auth/encrypting-adapter";
import {
  enforceSessionVersion,
  issueSessionVersion,
} from "@/lib/auth/session-version";
import { oauthSignInGate } from "@/lib/auth/signups";
import { newDate } from "@/lib/date-utils";
import { GOOGLE_SIGN_IN_SCOPES } from "@/lib/google-oauth-scopes";
import { logger } from "@/lib/logger";
import { MICROSOFT_GRAPH_SCOPES } from "@/lib/outlook";
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

// Create a function to get the auth options with the credentials
export async function getAuthOptions(): Promise<NextAuthOptions> {
  // Get credentials from database or environment variables
  const googleCredentials = await getGoogleCredentials();
  const outlookCredentials = await getOutlookCredentials();

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

  if (googleCredentials.clientId && googleCredentials.clientSecret) {
    providers.unshift(
      GoogleProvider({
        clientId: googleCredentials.clientId,
        clientSecret: googleCredentials.clientSecret,
        authorization: {
          params: {
            scope: GOOGLE_SIGN_IN_SCOPES.join(" "),
          },
        },
      })
    );
  }

  if (
    outlookCredentials.clientId &&
    outlookCredentials.clientSecret &&
    outlookCredentials.tenantId
  ) {
    providers.unshift(
      AzureADProvider({
        clientId: outlookCredentials.clientId,
        clientSecret: outlookCredentials.clientSecret,
        tenantId: outlookCredentials.tenantId,
        authorization: {
          params: {
            scope: MICROSOFT_GRAPH_SCOPES.join(" "),
          },
        },
      })
    );
  }

  return {
    adapter: withEncryptedAccountTokens(
      PrismaAdapter(prisma) as NonNullable<NextAuthOptions["adapter"]>
    ),
    // Add secret for production - required for security
    secret: authSecret(),

    providers,
    callbacks: {
      async signIn({ user, account }) {
        /* Registration is closed until launch: an OAuth return that would
           create a user goes back to sign-in instead of into the adapter. */
        const gate = await oauthSignInGate({
          provider: account?.provider,
          providerAccountId: account?.providerAccountId,
          email: user.email,
        });
        if (gate !== true) return gate;
        if (account?.provider !== "credentials" && user.email) {
          await prisma.user.updateMany({
            where: { email: user.email },
            data: { lastAuthenticatedAt: newDate() },
          });
        }
        return true;
      },
      // This branch's jwt supersedes main's: it keeps token.sub and the role
      // instead of early-returning a fresh token object that dropped both.
      async jwt({ token: incoming, account, user }) {
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
          if (account.type === "oauth" && user?.id && user.email) {
            await markEmailVerifiedAndStartTrial({
              userId: user.id,
              email: user.email,
            });
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
    },
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
