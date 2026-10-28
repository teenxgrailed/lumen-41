import { warnIfVapidConfigurationIsMissingOnce } from "@/services/reminders/reminder-delivery";
import { provisionSandboxAccounts } from "@/services/sandbox/sandbox-service";
import { backfillProviderSecrets } from "@/services/security/provider-secrets-backfill";

import { logger } from "@/lib/logger";
import { assertSecretEncryptionKeyConfigured } from "@/lib/security/secret-encryption";

const LOG_SOURCE = "WorkerStartup";

export async function runWorkerStartupChecks() {
  // Refuse to start in production without a real encryption key: every
  // provider sync would otherwise fail on its first stored credential.
  assertSecretEncryptionKeyConfigured();
  await warnIfVapidConfigurationIsMissingOnce();

  // Encrypt any provider credentials still stored as plaintext. Idempotent
  // and concurrency-safe, so it runs on every start without blocking it.
  void backfillProviderSecrets({ direction: "encrypt" }).catch((error) =>
    logger.error(
      "Provider secrets backfill failed at worker start",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    )
  );

  // Sandbox accounts from SANDBOX_REVIEWER_* (docs/sandbox-accounts.md).
  // Idempotent, a no-op while the env or the sandbox_accounts flag is unset,
  // and never blocks the start.
  void provisionSandboxAccounts().catch((error) =>
    logger.error(
      "Sandbox provisioning failed at worker start",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    )
  );
}
