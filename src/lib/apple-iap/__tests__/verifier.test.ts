import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { AppleIapConfig } from "../config";
import {
  APPLE_ROOT_CERTIFICATES_BASE64,
  APPLE_ROOT_FINGERPRINTS,
} from "../root-certificates";
import {
  AppleVerificationError,
  verifyAppleNotification,
  verifyAppleTransaction,
} from "../verifier";
import { createTestChain } from "./test-chain";

const chain = createTestChain();
const stranger = createTestChain("Stranger");

const sandbox: AppleIapConfig = {
  environment: "Sandbox",
  allowSandbox: false,
  bundleIds: ["app.needt.ios", "app.needt.mac"],
  appAppleId: null,
};
const production: AppleIapConfig = {
  environment: "Production",
  allowSandbox: false,
  bundleIds: ["app.needt.ios", "app.needt.mac"],
  appAppleId: 6400000000,
};

function transaction(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    transactionId: "2000000000000001",
    originalTransactionId: "2000000000000001",
    bundleId: "app.needt.ios",
    productId: "app.needt.pro.monthly",
    type: "Auto-Renewable Subscription",
    purchaseDate: now,
    expiresDate: now + 30 * 24 * 3600 * 1000,
    signedDate: now,
    environment: "Sandbox",
    appAccountToken: "6f0a6c43-9d55-4a4b-8f39-1f8c1e5b1f00",
    ...overrides,
  };
}

const options = (config: AppleIapConfig) => ({
  config,
  rootCertificates: [chain.root],
});

async function reason(promise: Promise<unknown>) {
  try {
    await promise;
    return "verified";
  } catch (error) {
    return error instanceof AppleVerificationError ? error.reason : "other";
  }
}

describe("Apple JWS verification", () => {
  it("verifies a transaction signed by a trusted chain", async () => {
    const result = await verifyAppleTransaction(
      chain.sign(transaction()),
      options(sandbox)
    );
    expect(result.environment).toBe("Sandbox");
    expect(result.transaction.productId).toBe("app.needt.pro.monthly");
  });

  it("accepts the Mac bundle as well", async () => {
    const result = await verifyAppleTransaction(
      chain.sign(transaction({ bundleId: "app.needt.mac" })),
      options(sandbox)
    );
    expect(result.transaction.bundleId).toBe("app.needt.mac");
  });

  it("rejects a tampered payload (bad signature)", async () => {
    const jws = chain.sign(transaction());
    const [header, , signature] = jws.split(".");
    const forged = Buffer.from(
      JSON.stringify(transaction({ productId: "app.needt.lifetime" }))
    ).toString("base64url");
    expect(
      await reason(
        verifyAppleTransaction(
          `${header}.${forged}.${signature}`,
          options(sandbox)
        )
      )
    ).toBe("invalid_signature");
  });

  it("rejects a chain that does not end in a trusted root", async () => {
    expect(
      await reason(
        verifyAppleTransaction(stranger.sign(transaction()), options(sandbox))
      )
    ).toBe("invalid_signature");
  });

  it("rejects a chain when only Apple's real roots are trusted", async () => {
    expect(
      await reason(
        verifyAppleTransaction(chain.sign(transaction()), {
          config: sandbox,
          onlineChecks: false,
        })
      )
    ).toBe("invalid_signature");
  });

  it("rejects another app's bundle id", async () => {
    expect(
      await reason(
        verifyAppleTransaction(
          chain.sign(transaction({ bundleId: "com.example.other" })),
          options(sandbox)
        )
      )
    ).toBe("wrong_bundle");
  });

  it("rejects a Production transaction on a Sandbox server", async () => {
    expect(
      await reason(
        verifyAppleTransaction(
          chain.sign(transaction({ environment: "Production" })),
          options(sandbox)
        )
      )
    ).toBe("wrong_environment");
  });

  it("rejects a Sandbox transaction on a Production server by default", async () => {
    expect(
      await reason(
        verifyAppleTransaction(chain.sign(transaction()), options(production))
      )
    ).toBe("wrong_environment");
  });

  it("accepts Sandbox on Production only when APPLE_IAP_ALLOW_SANDBOX is set", async () => {
    const result = await verifyAppleTransaction(
      chain.sign(transaction()),
      options({ ...production, allowSandbox: true })
    );
    expect(result.environment).toBe("Sandbox");
  });

  it("verifies a Production transaction on a Production server", async () => {
    const result = await verifyAppleTransaction(
      chain.sign(transaction({ environment: "Production" })),
      options(production)
    );
    expect(result.environment).toBe("Production");
  });

  it("refuses Production without the App Apple ID", async () => {
    expect(
      await reason(
        verifyAppleTransaction(
          chain.sign(transaction({ environment: "Production" })),
          options({ ...production, appAppleId: null })
        )
      )
    ).toBe("not_configured");
  });

  it("rejects something that is not a JWS", async () => {
    expect(
      await reason(verifyAppleTransaction("not-a-jws", options(sandbox)))
    ).toBe("malformed");
  });

  describe("notifications", () => {
    function notification(data: Record<string, unknown> = {}) {
      return {
        notificationType: "DID_RENEW",
        notificationUUID: "8b0f9a4e-0f7b-4bd0-9d2f-3c6f2f3f0c11",
        version: "2.0",
        signedDate: Date.now(),
        data: {
          bundleId: "app.needt.ios",
          environment: "Sandbox",
          signedTransactionInfo: chain.sign(transaction()),
          signedRenewalInfo: chain.sign({
            originalTransactionId: "2000000000000001",
            autoRenewStatus: 1,
            productId: "app.needt.pro.monthly",
            environment: "Sandbox",
            signedDate: Date.now(),
          }),
          ...data,
        },
      };
    }

    it("verifies the payload and the transaction and renewal inside it", async () => {
      const result = await verifyAppleNotification(
        chain.sign(notification()),
        options(sandbox)
      );
      expect(result.notification.notificationType).toBe("DID_RENEW");
      expect(result.transaction?.originalTransactionId).toBe(
        "2000000000000001"
      );
      expect(result.renewalInfo?.autoRenewStatus).toBe(1);
    });

    it("rejects a notification from an untrusted chain", async () => {
      expect(
        await reason(
          verifyAppleNotification(
            stranger.sign(notification()),
            options(sandbox)
          )
        )
      ).toBe("invalid_signature");
    });

    it("rejects a trusted payload that carries an untrusted transaction", async () => {
      expect(
        await reason(
          verifyAppleNotification(
            chain.sign(
              notification({
                signedTransactionInfo: stranger.sign(transaction()),
              })
            ),
            options(sandbox)
          )
        )
      ).toBe("invalid_signature");
    });

    it("rejects a Production notification without our App Apple ID", async () => {
      expect(
        await reason(
          verifyAppleNotification(
            chain.sign(
              notification({ environment: "Production", appAppleId: 1 })
            ),
            options(production)
          )
        )
      ).toBe("wrong_bundle");
    });
  });
});

describe("bundled Apple root certificates", () => {
  const dir = path.join(__dirname, "..", "certs");

  it.each(Object.keys(APPLE_ROOT_FINGERPRINTS))(
    "%s matches the file and Apple's published fingerprint",
    (file) => {
      const name = file as keyof typeof APPLE_ROOT_FINGERPRINTS;
      const fromFile = readFileSync(path.join(dir, name));
      const embedded = Buffer.from(
        APPLE_ROOT_CERTIFICATES_BASE64[name],
        "base64"
      );
      expect(embedded.equals(fromFile)).toBe(true);
      const cert = new X509Certificate(embedded);
      expect(cert.fingerprint256).toBe(APPLE_ROOT_FINGERPRINTS[name]);
      expect(cert.subject).toContain("O=Apple Inc.");
      expect(cert.verify(cert.publicKey)).toBe(true);
    }
  );
});
