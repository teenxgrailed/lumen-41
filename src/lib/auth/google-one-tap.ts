import { accountLinkingGate } from "@/lib/auth/account-linking";
import { hasAgeConfirmation } from "@/lib/auth/age-confirmation";
import {
  GoogleIdTokenError,
  type GoogleIdentity,
  type GoogleKeySource,
  verifyGoogleIdToken,
} from "@/lib/auth/google-id-token";
import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import { readSignInProviderConfig } from "@/lib/auth/sign-in-providers";
import { areSignupsOpen } from "@/lib/auth/signups";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "GoogleOneTap";

/** The NextAuth credentials provider the One Tap callback signs in through. */
export const ONE_TAP_PROVIDER_ID = "google-onetap";

/**
 * The reasons a One Tap sign-in is refused, as the codes NextAuth hands back
 * to the page (`oauth-error.ts` words them). Anything about the token itself
 * is one opaque `CredentialsSignin`.
 */
export type OneTapRefusal =
  | "CredentialsSignin"
  | "OAuthAccountNotLinked"
  | "SignupsClosed"
  | "AgeConfirmRequired"
  | "AccessDenied";

export class OneTapError extends Error {
  constructor(public readonly code: OneTapRefusal) {
    super(code);
    this.name = "OneTapError";
  }
}

export interface OneTapUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role: string;
  /** True only on the sign-in that created the account. */
  oneTapNew: boolean;
  /** The address Google vouched for, for the jwt callback's trial step. */
  oneTapEmail: string;
}

/* Sandbox accounts sign in only through their own provisioned path
   (docs/sandbox-accounts.md); a deactivated one not at all. */
function assertMayUseOneTap(user: { isActive: boolean; sandboxKind: unknown }) {
  if (!user.isActive || user.sandboxKind) throw new OneTapError("AccessDenied");
}

interface Deps {
  keys?: GoogleKeySource;
  nowMs?: number;
}

/**
 * Signs a person in from a Google Identity Services credential, with the same
 * rules the OAuth Google button has: the account is found by Google's id, or
 * joined by the verified email (`accountLinkingGate`), or created when sign-up
 * is open and the 16+ confirmation cookie is there. Returns the user for
 * NextAuth, or throws `OneTapError`.
 */
export async function signInWithGoogleCredential(
  credential: unknown,
  deps: Deps = {}
): Promise<OneTapUser> {
  const config = await readSignInProviderConfig();
  const { clientId, clientSecret } = config.google;
  if (!clientId || !clientSecret) throw new OneTapError("CredentialsSignin");

  let identity: GoogleIdentity;
  try {
    identity = await verifyGoogleIdToken(credential, {
      clientId,
      keys: deps.keys,
      nowMs: deps.nowMs,
    });
  } catch (error) {
    logger.warn(
      "Refused a Google One Tap credential",
      {
        reason:
          error instanceof GoogleIdTokenError
            ? error.reason
            : error instanceof Error
              ? error.message
              : "Unknown error",
      },
      LOG_SOURCE
    );
    throw new OneTapError("CredentialsSignin");
  }

  const profile = {
    email: identity.email,
    email_verified: true,
    sub: identity.sub,
  };
  const link = await accountLinkingGate({
    provider: "google",
    providerAccountId: identity.sub,
    profile,
  });
  if (link !== true) throw new OneTapError("OAuthAccountNotLinked");

  const linked = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: identity.sub,
      },
    },
    select: { user: true },
  });
  let user = linked?.user ?? null;
  if (user) assertMayUseOneTap(user);
  let isNew = false;

  if (!user) {
    user = await prisma.user.findFirst({
      where: { email: { equals: identity.email, mode: "insensitive" } },
    });
    if (user) {
      assertMayUseOneTap(user);
      /* The gate above allowed this join: Google vouches for the address. */
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: identity.sub,
        },
      });
    }
  }

  if (!user) {
    if (!(await areSignupsOpen()) || !(await isPublicSignupEnabled())) {
      throw new OneTapError("SignupsClosed");
    }
    const nowMs = deps.nowMs ?? newDate().getTime();
    if (!(await hasAgeConfirmation(nowMs))) {
      throw new OneTapError("AgeConfirmRequired");
    }
    user = await prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        image: identity.picture,
        ageConfirmedAt: newDate(),
        accounts: {
          create: {
            type: "oauth",
            provider: "google",
            providerAccountId: identity.sub,
          },
        },
      },
    });
    isNew = true;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    oneTapNew: isNew,
    oneTapEmail: identity.email,
  };
}
