/*
 * `UserSettings.prefs` caps, checked by PATCH /api/user-settings on the merged
 * map (not only the patch), so repeated new keys cannot grow it without bound.
 */
export const PREFS_MAX_BYTES = 32_000;
export const PREFS_MAX_KEYS = 200;

/** Keys that could reach an object's prototype: never stored. */
export const PREFS_FORBIDDEN_KEYS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
];
