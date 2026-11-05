import { expect, test } from "@playwright/test";

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
