import { accountLinkingGate } from "@/lib/auth/account-linking";
import { hasAgeConfirmation } from "@/lib/auth/age-confirmation";
import {
  GoogleIdTokenError,
  type GoogleIdentity,
  type GoogleKeySource,
  verifyGoogleIdToken,
} from "@/lib/auth/google-id-token";
import { currentOneTapNonce } from "@/lib/auth/google-one-tap-nonce";
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
  /** When Google issued the token (ms): the real age of the proof. */
  oneTapAuthAt: number;
}

/* Sandbox accounts sign in only through their own provisioned path
   (docs/sandbox-accounts.md); a deactivated one not at all. */
function assertMayUseOneTap(user: { isActive: boolean; sandboxKind: unknown }) {
  if (!user.isActive || user.sandboxKind) throw new OneTapError("AccessDenied");
}

interface Deps {
  keys?: GoogleKeySource;
  nowMs?: number;
  /** Tests: the nonce the cookie would hold (null: no valid cookie). */
  nonce?: string | null;
}

/**
 * Signs a person in from a Google Identity Services credential, with the same
 * rules the OAuth Google button has: the account is found by Google's id, or
 * joined by the verified email (`accountLinkingGate`), or created when sign-up
 * is open and the 16+ confirmation cookie is there. The token must carry the
 * nonce from this browser's signed cookie. Returns the user for NextAuth, or
 * throws `OneTapError`.
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
    const nonce =
      deps.nonce !== undefined
        ? deps.nonce
        : await currentOneTapNonce(deps.nowMs ?? newDate().getTime());
    identity = await verifyGoogleIdToken(credential, {
      clientId,
      keys: deps.keys,
      nowMs: deps.nowMs,
      nonce: nonce ?? "",
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

  /* Who this would be, and whether they may sign in at all, BEFORE the
     linking gate: a refused sign-in must not wipe a password or end sessions
     (claimUnconfirmedAccountByProvider runs inside the gate). */
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
  const joining = user
    ? null
    : await prisma.user.findFirst({
        where: { email: { equals: identity.email, mode: "insensitive" } },
      });
  const known = user ?? joining;
  if (known) assertMayUseOneTap(known);

  const link = await accountLinkingGate({
    provider: "google",
    providerAccountId: identity.sub,
    profile: {
      email: identity.email,
      email_verified: true,
      sub: identity.sub,
      ...(identity.hd ? { hd: identity.hd } : {}),
    },
  });
  if (link !== true) throw new OneTapError("OAuthAccountNotLinked");

  let isNew = false;
  if (!user && joining) {
    user = joining;
    /* The gate above allowed this join. */
    await prisma.account.create({
      data: {
        userId: joining.id,
        type: "oauth",
        provider: "google",
        providerAccountId: identity.sub,
      },
    });
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
    oneTapAuthAt: identity.issuedAtMs,
  };
}
