import { isAuthPath } from "../auth-path";

describe("isAuthPath", () => {
  it.each([
    "/auth/signin",
    "/auth/reset-password",
    "/auth/confirm-email",
    "/auth/desktop",
    "/auth",
  ])("%s is a sign-in page", (path) => {
    expect(isAuthPath(path)).toBe(true);
  });

  it.each(["/today", "/", "/authors", "/settings/auth", "", null, undefined])(
    "%s is not",
    (path) => {
      expect(isAuthPath(path as string | null | undefined)).toBe(false);
    }
  );
});
