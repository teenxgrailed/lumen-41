import {
  UTM_COOKIE,
  serializeUtm,
  utmCookie,
  utmFromCookieHeader,
  utmFromSearch,
} from "@/lib/attribution";

describe("utmFromSearch", () => {
  it("reads the five tags and ignores everything else", () => {
    expect(
      utmFromSearch(
        "?utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_term=planner&utm_content=cta&mode=signup&x=1"
      )
    ).toEqual({
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "launch",
      utm_term: "planner",
      utm_content: "cta",
    });
  });

  it("drops markup, empty values and long values", () => {
    expect(utmFromSearch("?utm_source=%3Cscript%3E&utm_medium=")).toEqual({});
    expect(
      utmFromSearch(`?utm_source=${"a".repeat(300)}`).utm_source
    ).toHaveLength(100);
  });
});

describe("the cookie", () => {
  it("round-trips through a Cookie header", () => {
    const cookie = utmCookie({ utm_source: "x y", utm_medium: "cpc" }, true)!;
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    const header = `a=1; ${cookie.split(";")[0]}; b=2`;
    expect(utmFromCookieHeader(header)).toEqual({
      utm_source: "x y",
      utm_medium: "cpc",
    });
  });

  it("is not written when there are no tags", () => {
    expect(utmCookie({}, true)).toBeNull();
    expect(serializeUtm({})).toBeNull();
  });

  it("reads nothing from a missing or malformed cookie", () => {
    expect(utmFromCookieHeader(null)).toEqual({});
    expect(utmFromCookieHeader(`${UTM_COOKIE}=%E0%A4%A`)).toEqual({});
  });
});
