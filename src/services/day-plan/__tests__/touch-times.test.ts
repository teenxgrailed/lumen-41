import { planSettingsPatchSchema } from "../rules";

test("test_touch_time_after_23_30_is_rejected", () => {
  for (const time of ["23:31", "23:45", "23:59"]) {
    for (const field of ["morningTime", "eveningTime"]) {
      const result = planSettingsPatchSchema.safeParse({ [field]: time });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain(
        "23:30 or earlier"
      );
    }
  }
  for (const time of ["00:00", "08:00", "23:00", "23:30"]) {
    expect(
      planSettingsPatchSchema.safeParse({
        morningTime: time,
        eveningTime: time,
      }).success
    ).toBe(true);
  }
});
