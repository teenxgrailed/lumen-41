import { expect, test } from "@playwright/test";

import { PREFS_MAX_KEYS } from "@/lib/needt3/prefs-limits";
import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * `PATCH /api/user-settings` treats `prefs` as a patch the server merges into
 * the stored map (Postgres `prefs || patch`), so two writers of different keys
 * (two tabs, two devices, a stale cache) both keep theirs; a key sent as null
 * is removed.
 */
test("prefs: concurrent writes of different keys both survive; null removes a key", async ({
  page,
}) => {
  const user = await createV3User("prefs-merge");
  await signInAs(page, user);
  const patch = (prefs: Record<string, unknown>) =>
    page.request.patch("/api/user-settings", { data: { prefs } });

  const first = await patch({ keep: "me" });
  expect(first.ok()).toBe(true);

  // Each writer sends only its own key, as a tab with a stale cache would.
  const writes = await Promise.all(
    Array.from({ length: 8 }, (_, i) => patch({ [`k${i}`]: i }))
  );
  for (const w of writes) expect(w.ok()).toBe(true);

  const read = async () =>
    (
      (await (await page.request.get("/api/user-settings")).json()) as {
        prefs: Record<string, unknown>;
      }
    ).prefs;
  const prefs = await read();
  expect(prefs.keep).toBe("me");
  for (let i = 0; i < 8; i++) expect(prefs[`k${i}`]).toBe(i);

  // A key's value is replaced whole; null removes it; the rest stay.
  expect((await patch({ k0: { a: 1 }, k1: null })).ok()).toBe(true);
  const after = await read();
  expect(after.k0).toEqual({ a: 1 });
  expect("k1" in after).toBe(false);
  expect(after.keep).toBe("me");
  expect(after.k2).toBe(2);
});

test("prefs stored past a cap (before the caps existed) can still shrink, but not grow", async ({
  page,
}) => {
  const user = await createV3User("prefs-over-cap");
  await signInAs(page, user);
  // Written straight to the row, as the old replace-write could have.
  const over = Object.fromEntries(
    Array.from({ length: PREFS_MAX_KEYS + 20 }, (_, i) => [`old${i}`, i])
  );
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { prefs: over },
    create: { userId: user.id, timeZone: "UTC", prefs: over },
  });
  const patch = (prefs: Record<string, unknown>) =>
    page.request.patch("/api/user-settings", { data: { prefs } });

  // Deleting a key and changing one in place are allowed.
  expect((await patch({ old0: null })).status()).toBe(200);
  expect((await patch({ old1: "changed" })).status()).toBe(200);
  // A new key would grow a map already past the cap.
  expect((await patch({ brandNew: true })).status()).toBe(413);

  const row = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { prefs: true },
  });
  const prefs = row!.prefs as Record<string, unknown>;
  expect("old0" in prefs).toBe(false);
  expect(prefs.old1).toBe("changed");
  expect("brandNew" in prefs).toBe(false);
});
