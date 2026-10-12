import {
  PHONE_MEDIA_QUERY,
  parseUiCookie,
  phoneUiFrom,
  resolvePhoneUi,
} from "../phone-ui";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("parseUiCookie", () => {
  it("reads the two sides and nothing else", () => {
    expect(parseUiCookie("phone")).toBe("phone");
    expect(parseUiCookie("desktop")).toBe("desktop");
    expect(parseUiCookie(" Phone ")).toBe("phone");
    expect(parseUiCookie("tablet")).toBeNull();
    expect(parseUiCookie("")).toBeNull();
    expect(parseUiCookie(undefined)).toBeNull();
    expect(parseUiCookie(null)).toBeNull();
  });
});

describe("phoneUiFrom", () => {
  it("the cookie wins over the hint and the user agent", () => {
    expect(
      phoneUiFrom({ cookie: "desktop", secChUaMobile: "?1", userAgent: IPHONE })
    ).toBe("desktop");
    expect(
      phoneUiFrom({ cookie: "phone", secChUaMobile: "?0", userAgent: WINDOWS })
    ).toBe("phone");
  });

  it("an unknown cookie falls through to the hint", () => {
    expect(
      phoneUiFrom({ cookie: "tablet", secChUaMobile: "?1", userAgent: MAC })
    ).toBe("phone");
  });

  it("Sec-CH-UA-Mobile ?1 means phone, with or without a user agent", () => {
    expect(phoneUiFrom({ secChUaMobile: "?1" })).toBe("phone");
    expect(phoneUiFrom({ secChUaMobile: "?1", userAgent: WINDOWS })).toBe(
      "phone"
    );
  });

  it("?0 is not an answer: the user agent decides", () => {
    expect(phoneUiFrom({ secChUaMobile: "?0", userAgent: WINDOWS })).toBe(
      "desktop"
    );
    expect(phoneUiFrom({ secChUaMobile: "?0", userAgent: ANDROID })).toBe(
      "phone"
    );
  });

  it("iOS (iPhone, iPad, iPod) and Android user agents are phones", () => {
    expect(phoneUiFrom({ userAgent: IPHONE })).toBe("phone");
    expect(phoneUiFrom({ userAgent: IPAD })).toBe("phone");
    expect(phoneUiFrom({ userAgent: "Mozilla/5.0 (iPod touch)" })).toBe(
      "phone"
    );
    expect(phoneUiFrom({ userAgent: ANDROID })).toBe("phone");
  });

  it("desktop browsers, empty input and missing headers are the desktop", () => {
    expect(phoneUiFrom({ userAgent: MAC })).toBe("desktop");
    expect(phoneUiFrom({ userAgent: WINDOWS })).toBe("desktop");
    expect(phoneUiFrom({})).toBe("desktop");
    expect(phoneUiFrom({ userAgent: null, secChUaMobile: null })).toBe(
      "desktop"
    );
  });
});

describe("resolvePhoneUi", () => {
  it("before the client measures, the server's pick stands (no hydration mismatch)", () => {
    expect(
      resolvePhoneUi({ initial: "phone", forced: false, narrow: null })
    ).toBe("phone");
    expect(
      resolvePhoneUi({ initial: "desktop", forced: false, narrow: null })
    ).toBe("desktop");
  });

  it("after hydration the width decides, both ways", () => {
    expect(
      resolvePhoneUi({ initial: "phone", forced: false, narrow: false })
    ).toBe("desktop");
    expect(
      resolvePhoneUi({ initial: "desktop", forced: false, narrow: true })
    ).toBe("phone");
    expect(
      resolvePhoneUi({ initial: "phone", forced: false, narrow: true })
    ).toBe("phone");
  });

  it("a pinned side ignores the width", () => {
    expect(
      resolvePhoneUi({ initial: "phone", forced: true, narrow: false })
    ).toBe("phone");
    expect(
      resolvePhoneUi({ initial: "desktop", forced: true, narrow: true })
    ).toBe("desktop");
  });

  it("the query is just under 700 px, like the rail's", () => {
    expect(PHONE_MEDIA_QUERY).toBe("(max-width: 699.98px)");
  });
});
