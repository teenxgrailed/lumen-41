import { passwordSchema } from "@/lib/auth/password-schema";

describe("passwordSchema", () => {
  it.each(["abcdefgh", "ALLUPPER1", "12345678", "Abcdefg1", "a".repeat(128)])(
    "accepts %j",
    (password) => {
      expect(passwordSchema.safeParse(password).success).toBe(true);
    }
  );

  it.each(["", "abcdefg", "a".repeat(129)])("rejects %j", (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });
});
