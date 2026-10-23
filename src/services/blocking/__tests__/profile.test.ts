import {
  blockingProfileCreateSchema,
  blockingProfileUpdateSchema,
  normalizeSite,
} from "../profile";

describe("normalizeSite", () => {
  it.each([
    ["https://www.YouTube.com/feed?x=1", "youtube.com"],
    ["x.com", "x.com"],
    ["*.Reddit.com", "*.reddit.com"],
    ["news.ycombinator.com:443/", "news.ycombinator.com"],
    ["user@mail.example.org", "mail.example.org"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeSite(input)).toBe(expected);
  });

  it.each(["", "localhost", "not a site", "http://", "*."])(
    "rejects %p",
    (input) => {
      expect(normalizeSite(input)).toBeNull();
    }
  );
});

describe("profile schemas", () => {
  it("fills defaults and normalises lists", () => {
    const parsed = blockingProfileCreateSchema.parse({
      name: " Deep work ",
      sites: ["YouTube.com", "https://youtube.com/watch"],
      eventKeywords: ["Deep Work"],
      apps: ["com.tinyspeck.slackmacgap"],
    });
    expect(parsed).toMatchObject({
      name: "Deep work",
      sites: ["youtube.com"],
      eventKeywords: ["deep work"],
      mode: "BLOCKLIST",
      onFocusSession: false,
      enabled: true,
    });
  });

  it("refuses a bad site or bundle id", () => {
    expect(
      blockingProfileCreateSchema.safeParse({ name: "a", sites: ["nope"] })
        .success
    ).toBe(false);
    expect(
      blockingProfileCreateSchema.safeParse({ name: "a", apps: ["Slack"] })
        .success
    ).toBe(false);
  });

  it("refuses an empty update", () => {
    expect(blockingProfileUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      blockingProfileUpdateSchema.safeParse({ enabled: false }).success
    ).toBe(true);
  });
});
