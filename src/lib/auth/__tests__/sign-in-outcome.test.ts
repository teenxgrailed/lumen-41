import { signInSucceeded } from "@/lib/auth/sign-in-outcome";

describe("signInSucceeded", () => {
  it("is a success for a redirect to the callback", () => {
    expect(
      signInSucceeded({ status: 302, location: "http://localhost/calendar" })
    ).toBe(true);
  });

  it("is a refusal for a redirect to the sign-in page with an error", () => {
    expect(
      signInSucceeded({
        status: 302,
        location: "http://localhost/auth/signin?error=CredentialsSignin",
      })
    ).toBe(false);
  });

  it("reads the JSON body of a redirect:false call", () => {
    expect(
      signInSucceeded({
        status: 200,
        body: JSON.stringify({
          url: "http://localhost/auth/signin?error=AgeConfirmRequired",
        }),
      })
    ).toBe(false);
    expect(
      signInSucceeded({
        status: 200,
        body: JSON.stringify({ url: "http://localhost/calendar" }),
      })
    ).toBe(true);
  });

  it("is not fooled by a callbackUrl that contains error=", () => {
    expect(
      signInSucceeded({
        status: 302,
        location: "http://localhost/calendar?note=error=1",
      })
    ).toBe(true);
    expect(
      signInSucceeded({
        status: 200,
        body: JSON.stringify({ url: "http://localhost/docs?error=none" }),
      })
    ).toBe(true);
  });

  it("is a refusal for any error status", () => {
    expect(signInSucceeded({ status: 401 })).toBe(false);
    expect(signInSucceeded({ status: 500 })).toBe(false);
  });

  it("ignores a body that is not JSON", () => {
    expect(signInSucceeded({ status: 200, body: "<html>error=1</html>" })).toBe(
      true
    );
  });
});
