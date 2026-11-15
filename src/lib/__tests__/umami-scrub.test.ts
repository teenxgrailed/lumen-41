import { scrubReferrer, scrubUrl, umamiBeforeSend } from "../umami-scrub";

describe("umamiBeforeSend", () => {
  it("drops email, token and hash from auth page URLs", () => {
    expect(
      scrubUrl(
        "https://use.needt.app/auth/confirm-email?email=a%40b.com&token=SECRET#code=x&verifier=y"
      )
    ).toBe("/auth/confirm-email");
    expect(
      scrubUrl("https://use.needt.app/auth/reset-password?token=SECRET")
    ).toBe("/auth/reset-password");
  });

  it("keeps utm and ref so Product Hunt traffic is separable", () => {
    expect(
      scrubUrl(
        "https://needt.app/?ref=producthunt&utm_source=ph&utm_campaign=launch&other=1"
      )
    ).toBe("/?utm_source=ph&utm_campaign=launch&ref=producthunt");
    const kept = String(scrubUrl("https://needt.app/?ref=producthunt&x=1"));
    expect(kept).toBe("/?ref=producthunt");
  });

  it("drops a kept tag whose value looks like an address", () => {
    expect(scrubUrl("https://needt.app/?utm_source=me%40x.com")).toBe("/");
    expect(scrubUrl("https://needt.app/?ref=%3Cscript%3E")).toBe("/");
  });

  it("replaces secret path segments", () => {
    expect(scrubUrl("https://use.needt.app/p/abc123")).toBe("/p/:token");
    expect(scrubUrl("https://use.needt.app/book/cancel/abc123")).toBe(
      "/book/cancel/:token"
    );
    expect(scrubUrl("https://use.needt.app/b/id1/tok2")).toBe("/b/:id");
    expect(scrubUrl("https://use.needt.app/tasks?task=cl1")).toBe("/tasks");
  });

  it("reduces the referrer to origin and path and blanks the title", () => {
    expect(scrubReferrer("https://www.producthunt.com/posts/needt?q=1#x")).toBe(
      "https://www.producthunt.com/posts/needt"
    );
    const out = umamiBeforeSend("event", {
      website: "w",
      url: "https://use.needt.app/auth/reset-password?token=T",
      referrer: "https://example.com/a?email=a@b.com",
      title: "Buy milk",
      name: "icon_selected",
      data: { id: "x" },
    });
    expect(out).toEqual({
      website: "w",
      url: "/auth/reset-password",
      referrer: "https://example.com/a",
      title: "",
      name: "icon_selected",
      data: { id: "x" },
    });
  });
});
