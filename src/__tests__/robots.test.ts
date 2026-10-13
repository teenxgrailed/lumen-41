import robots from "@/app/robots";

describe("robots.txt", () => {
  it("disallows every crawler from the whole application", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });
});
