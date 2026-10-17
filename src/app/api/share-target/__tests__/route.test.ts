import { NextRequest } from "next/server";

import { POST } from "../route";

function post(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.append("files", new File(["x"], "a.png", { type: "image/png" }));
  return new NextRequest("https://app.needt.test/api/share-target", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/share-target (no service worker in control)", () => {
  // The redirect is built from NEXTAUTH_URL when it is set (CI sets it).
  const previousUrl = process.env.NEXTAUTH_URL;
  beforeAll(() => {
    process.env.NEXTAUTH_URL = "https://app.needt.test";
  });
  afterAll(() => {
    if (previousUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previousUrl;
  });

  it("answers a share with a 303 to the Share page, a GET", async () => {
    const res = await POST(
      post({ title: "Trip", text: "Dates", url: "https://example.com/trip" })
    );
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin).toBe("https://app.needt.test");
    expect(to.pathname).toBe("/share");
    expect(to.searchParams.get("title")).toBe("Trip");
    expect(to.searchParams.get("text")).toBe("Dates");
    expect(to.searchParams.get("url")).toBe("https://example.com/trip");
  });

  it("does not carry files or a stash through the query", async () => {
    const res = await POST(post({ title: "Pic", stash: "../../x" }));
    const to = new URL(res.headers.get("location")!);
    expect(to.searchParams.has("stash")).toBe(false);
    expect(to.searchParams.has("files")).toBe(false);
  });

  it("still lands on the Share page when the body is empty", async () => {
    const res = await POST(
      new NextRequest("https://app.needt.test/api/share-target", {
        method: "POST",
      })
    );
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/share");
  });
});
