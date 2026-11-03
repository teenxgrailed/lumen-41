import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

describe("public pages need no session", () => {
  it.each(["/terms", "/privacy", "/subprocessors", "/support"])(
    "serves %s to a signed-out visitor without a sign-in redirect",
    async (path) => {
      const response = await middleware(
        new NextRequest(`http://needt.test${path}`)
      );
      expect(response.headers.get("location")).toBeNull();
    }
  );

  it("still sends a private page to sign-in", async () => {
    const response = await middleware(
      new NextRequest("http://needt.test/settings")
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/auth/signin"
    );
  });
});
