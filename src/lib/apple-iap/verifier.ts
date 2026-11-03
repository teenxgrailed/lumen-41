import {
  Environment,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library";

import {
  type AppleIapConfig,
  type AppleIapEnvironment,
  getAppleIapConfig,
} from "./config";
import { appleRootCertificates } from "./root-certificates";

/**
 * Verification of everything Apple signs for us: a StoreKit 2 transaction the
 * device posts (`Transaction.jwsRepresentation`) and an App Store Server
 * Notification V2 `signedPayload`. Both are JWS with an x5c chain that must
 * end in one of Apple's root certificates (bundled in `./certs`, never
 * fetched), for one of our bundle ids, in the configured environment.
 *
 * `options.rootCertificates` exists so tests can sign fixtures with a test CA;
 * production callers never pass it and get Apple's roots with Apple's online
 * revocation checks on.
 */

export type AppleVerificationReason =
  | "malformed"
  | "invalid_signature"
  | "wrong_bundle"
  | "wrong_environment"
  | "not_configured"
  /** Apple's OCSP responder could not be reached; worth retrying. */
  | "retryable";

export class AppleVerificationError extends Error {
  constructor(
    readonly reason: AppleVerificationReason,
    message: string = reason
  ) {
    super(message);
    this.name = "AppleVerificationError";
  }
}

export type AppleVerifyOptions = {
  config?: AppleIapConfig;
  /** Test-only trust anchors. Production uses Apple's bundled roots. */
  rootCertificates?: Buffer[];
  /** Defaults to true (revocation checks) unless test roots are injected. */
  onlineChecks?: boolean;
};

const verifierCache = new Map<string, SignedDataVerifier>();

function libraryEnvironment(environment: AppleIapEnvironment): Environment {
  return environment === "Production"
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

function verifierFor(
  environment: AppleIapEnvironment,
  bundleId: string,
  config: AppleIapConfig,
  options: AppleVerifyOptions
): SignedDataVerifier {
  if (environment === "Production" && config.appAppleId === null) {
    throw new AppleVerificationError(
      "not_configured",
      "APPLE_IAP_APP_APPLE_ID is required to verify Production purchases."
    );
  }
  const injected = Boolean(options.rootCertificates);
  const onlineChecks = options.onlineChecks ?? !injected;
  const build = () =>
    new SignedDataVerifier(
      options.rootCertificates ?? appleRootCertificates(),
      onlineChecks,
      libraryEnvironment(environment),
      bundleId,
      environment === "Production"
        ? (config.appAppleId ?? undefined)
        : undefined
    );
  if (injected) return build();
  const key = `${environment}|${bundleId}|${config.appAppleId ?? ""}|${onlineChecks}`;
  let verifier = verifierCache.get(key);
  if (!verifier) {
    verifier = build();
    verifierCache.set(key, verifier);
  }
  return verifier;
}

/** The JWS payload without verifying it: only to pick which verifier to run. */
function unverifiedPayload(jws: string): Record<string, unknown> {
  const parts = typeof jws === "string" ? jws.split(".") : [];
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new AppleVerificationError("malformed", "Not a compact JWS.");
  }
  try {
    const value: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("payload is not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new AppleVerificationError("malformed", "Unreadable JWS payload.");
  }
}

function stringField(record: unknown, key: string): string | null {
  if (!record || typeof record !== "object") return null;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function toVerificationError(error: unknown): AppleVerificationError {
  if (error instanceof AppleVerificationError) return error;
  if (error instanceof VerificationException) {
    switch (error.status) {
      case VerificationStatus.INVALID_APP_IDENTIFIER:
        return new AppleVerificationError("wrong_bundle");
      case VerificationStatus.INVALID_ENVIRONMENT:
        return new AppleVerificationError("wrong_environment");
      case VerificationStatus.RETRYABLE_VERIFICATION_FAILURE:
        return new AppleVerificationError("retryable");
      default:
        return new AppleVerificationError("invalid_signature");
    }
  }
  return new AppleVerificationError("invalid_signature");
}

/** Environments to try, in order: the configured one, then Sandbox if allowed. */
function environmentsToTry(config: AppleIapConfig): AppleIapEnvironment[] {
  return config.allowSandbox
    ? [config.environment, "Sandbox"]
    : [config.environment];
}

async function verifyInEnvironments<T>(
  config: AppleIapConfig,
  run: (environment: AppleIapEnvironment) => Promise<T>
): Promise<{ value: T; environment: AppleIapEnvironment }> {
  let lastError: AppleVerificationError | null = null;
  for (const environment of environmentsToTry(config)) {
    try {
      return { value: await run(environment), environment };
    } catch (error) {
      lastError = toVerificationError(error);
      // Only a payload signed for the other environment is worth a second
      // try; a bad signature stays bad whichever verifier reads it.
      if (lastError.reason !== "wrong_environment") throw lastError;
    }
  }
  throw lastError ?? new AppleVerificationError("invalid_signature");
}

export type VerifiedAppleTransaction = {
  transaction: JWSTransactionDecodedPayload;
  environment: AppleIapEnvironment;
};

export async function verifyAppleTransaction(
  signedTransaction: string,
  options: AppleVerifyOptions = {}
): Promise<VerifiedAppleTransaction> {
  const config = options.config ?? getAppleIapConfig();
  const bundleId = stringField(
    unverifiedPayload(signedTransaction),
    "bundleId"
  );
  if (!bundleId || !config.bundleIds.includes(bundleId)) {
    throw new AppleVerificationError("wrong_bundle");
  }
  const { value, environment } = await verifyInEnvironments(
    config,
    (environment) =>
      verifierFor(
        environment,
        bundleId,
        config,
        options
      ).verifyAndDecodeTransaction(signedTransaction)
  );
  return { transaction: value, environment };
}

export type VerifiedAppleNotification = {
  notification: ResponseBodyV2DecodedPayload;
  transaction: JWSTransactionDecodedPayload | null;
  renewalInfo: JWSRenewalInfoDecodedPayload | null;
  environment: AppleIapEnvironment;
  bundleId: string;
};

export async function verifyAppleNotification(
  signedPayload: string,
  options: AppleVerifyOptions = {}
): Promise<VerifiedAppleNotification> {
  const config = options.config ?? getAppleIapConfig();
  const payload = unverifiedPayload(signedPayload);
  const bundleId =
    stringField(payload.data, "bundleId") ??
    stringField(payload.summary, "bundleId");
  if (!bundleId || !config.bundleIds.includes(bundleId)) {
    throw new AppleVerificationError("wrong_bundle");
  }
  const { value, environment } = await verifyInEnvironments(
    config,
    async (environment) => {
      const verifier = verifierFor(environment, bundleId, config, options);
      const notification =
        await verifier.verifyAndDecodeNotification(signedPayload);
      const data = notification.data;
      const transaction = data?.signedTransactionInfo
        ? await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo)
        : null;
      const renewalInfo = data?.signedRenewalInfo
        ? await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo)
        : null;
      return { notification, transaction, renewalInfo };
    }
  );
  return { ...value, environment, bundleId };
}
