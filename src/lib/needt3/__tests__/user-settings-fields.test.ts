import { parseV3Fields, userSettingsV3FieldsSchema } from "../api-fields";

describe("user settings: timeFormat", () => {
  it("accepts 12h and 24h", () => {
    for (const timeFormat of ["12h", "24h"]) {
      const r = parseV3Fields(userSettingsV3FieldsSchema, { timeFormat });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toEqual({ timeFormat });
    }
  });

  it("rejects anything else with a 400-style error", () => {
    const r = parseV3Fields(userSettingsV3FieldsSchema, { timeFormat: "13h" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("timeFormat");
  });

  it("leaves the field alone when absent", () => {
    const r = parseV3Fields(userSettingsV3FieldsSchema, { theme: "dark" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({});
  });
});

describe("user settings: prefs.appIcon and prefs.seenIconPicker", () => {
  it("accepts a known icon and the seen flag", () => {
    const prefs = { appIcon: "aurora", seenIconPicker: true, accent: "blue" };
    const r = parseV3Fields(userSettingsV3FieldsSchema, { prefs });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ prefs });
  });

  it("rejects an unknown icon", () => {
    const r = parseV3Fields(userSettingsV3FieldsSchema, {
      prefs: { appIcon: "neon" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Invalid app icon");
  });

  it("rejects a seen flag that is not a boolean", () => {
    const r = parseV3Fields(userSettingsV3FieldsSchema, {
      prefs: { seenIconPicker: "yes" },
    });
    expect(r.ok).toBe(false);
  });
});
