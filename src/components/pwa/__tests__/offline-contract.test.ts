import { readFileSync } from "node:fs";

const serviceWorker = readFileSync("public/sw.js", "utf8");

describe("offline privacy and replay contract", () => {
  it("partitions private caches and IndexedDB records by version, user and workspace", () => {
    expect(serviceWorker).toContain(
      'const PRIVATE_CACHE_PREFIX = "needt-private-v5:"'
    );
    expect(serviceWorker).toContain(
      "`${OFFLINE_SCHEMA_VERSION}:${scope.userId}:${scope.workspaceId}`"
    );
    expect(serviceWorker).toContain("scopeKey: activeScope.key");
    expect(serviceWorker).toContain(
      'headers.set("x-workspace-id", activeScope.workspaceId)'
    );
  });

  it("purges private caches, snapshots, queues and drafts on identity cleanup", () => {
    expect(serviceWorker).toContain("key.startsWith(PRIVATE_CACHE_PREFIX)");
    expect(serviceWorker).toContain("await clearStore(db, STORE_QUEUE)");
    expect(serviceWorker).toContain("await clearStore(db, STORE_SNAPSHOTS)");
    expect(serviceWorker).toContain("await clearStore(db, STORE_META)");

    for (const path of [
      "src/components/navigation/UserMenu.tsx",
      "src/components/settings/AccountSettings.tsx",
      "src/components/needt3/settings/sign-out-everywhere.ts",
      "src/components/needt/shell/NeedtAppShell.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("signOutOfNeedt()");
      expect(source).not.toMatch(/\bsignOut\(\{/);
    }
    const signOutHelper = readFileSync(
      "src/lib/auth/client-sign-out.ts",
      "utf8"
    );
    expect(signOutHelper.indexOf("await prepareNeedtSignOut()")).toBeLessThan(
      signOutHelper.indexOf("await signOut(")
    );
    expect(serviceWorker).toContain("workspaceId: nextScope.workspaceId,");
    expect(serviceWorker).toMatch(
      /async function flushQueue\(\) \{\n  await restoreActiveScope\(\);/
    );
    expect(serviceWorker).toMatch(
      /NEEDT_SYNC_NOW[\s\S]*?flushQueue\(\)[\s\S]*?event\.ports\[0\]\?\.postMessage/
    );
  });

  it("queues only explicit offline-safe mutations", () => {
    expect(serviceWorker).toContain("const OFFLINE_MUTATIONS = [");
    expect(serviceWorker).toContain(
      "pattern: /^\\/api\\/pages\\/[^/]+\\/blocks\\/?$/"
    );
    expect(serviceWorker).toContain("pattern: /^\\/api\\/daily-agenda\\/?$/");
    expect(serviceWorker).not.toContain("MUTATION_METHODS.has(request.method)");
    expect(serviceWorker).not.toContain("pattern: /^\\/api\\/tasks\\/?$/");
  });

  it("deletes queued work only after accepted 2xx responses", () => {
    expect(serviceWorker).toContain(
      "response.status >= 200 && response.status < 300"
    );
    expect(serviceWorker).toContain("response.status === 401");
    expect(serviceWorker).toContain("response.status === 403");
    expect(serviceWorker).toContain("response.status === 409");
    expect(serviceWorker).toContain('"OFFLINE_REPLAY_PENDING"');
    expect(serviceWorker).toContain("response.status >= 500");
    expect(serviceWorker).toContain('? "sign_in_required"');
    expect(serviceWorker).toContain(': "conflict"');
    expect(serviceWorker).toContain(
      '["pending", "retry", "syncing", "sign_in_required"].includes'
    );
  });

  it("stores idempotency and base-revision metadata for replay", () => {
    expect(serviceWorker).toContain('headers.set("x-idempotency-key"');
    expect(serviceWorker).toContain("idempotencyKey,");
    expect(serviceWorker).toContain("baseRevision:");
    expect(serviceWorker).toContain('headers.get("if-match")');
    expect(serviceWorker).toContain("fetch(scopedRequest.clone())");
    const offlineServer = readFileSync(
      "src/lib/pwa/offline-mutation.ts",
      "utf8"
    );
    expect(offlineServer).toContain("OFFLINE_REVISION_CONFLICT");
    expect(offlineServer).toContain("IdempotencyStatus.SUCCEEDED");
  });
});
