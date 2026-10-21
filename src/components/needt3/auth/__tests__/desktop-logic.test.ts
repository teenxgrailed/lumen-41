import {
  desktopDeepLink,
  parseCompleteFragment,
  validChallenge,
} from "@/components/needt3/auth/desktop-logic";

const CODE = "c".repeat(43);
const VERIFIER = "v".repeat(43);

describe("desktop sign-in pages", () => {
  it("builds the deep link only for a well-formed code", () => {
    expect(desktopDeepLink(CODE)).toBe(`needt://auth?code=${CODE}`);
    expect(desktopDeepLink("short")).toBeNull();
    expect(desktopDeepLink(`${CODE}&next=https://evil.example`)).toBeNull();
    expect(desktopDeepLink("")).toBeNull();
  });

  it("accepts a challenge only in the digest's shape", () => {
    expect(validChallenge("a".repeat(43))).toBe(true);
    expect(validChallenge("a".repeat(42))).toBe(false);
    expect(validChallenge("a".repeat(42) + "=")).toBe(false);
    expect(validChallenge("")).toBe(false);
    expect(validChallenge(null)).toBe(false);
    expect(validChallenge(undefined)).toBe(false);
  });

  it("reads the code and verifier out of the fragment", () => {
    expect(parseCompleteFragment(`#code=${CODE}&verifier=${VERIFIER}`)).toEqual(
      { code: CODE, verifier: VERIFIER }
    );
    expect(parseCompleteFragment(`code=${CODE}&verifier=${VERIFIER}`)).toEqual({
      code: CODE,
      verifier: VERIFIER,
    });
  });

  it("refuses a fragment with a missing or malformed part", () => {
    expect(parseCompleteFragment("")).toBeNull();
    expect(parseCompleteFragment(`#code=${CODE}`)).toBeNull();
    expect(parseCompleteFragment(`#verifier=${VERIFIER}`)).toBeNull();
    expect(parseCompleteFragment(`#code=x&verifier=${VERIFIER}`)).toBeNull();
    expect(parseCompleteFragment(`#code=${CODE}&verifier=x`)).toBeNull();
    expect(
      parseCompleteFragment(`#code=${CODE}%26x&verifier=${VERIFIER}`)
    ).toBeNull();
  });
});
