import { NextRequest } from "next/server";

import { POST } from "../route";

let role = "user";
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ role }) },
    externalIntegration: { upsert: jest.fn() },
  },
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const previousKey = process.env.COMPOSIO_API_KEY;
beforeEach(() => {
  delete process.env.COMPOSIO_API_KEY;
});
afterAll(() => {
  if (previousKey !== undefined) process.env.COMPOSIO_API_KEY = previousKey;
});

const call = () =>
  POST(
    new NextRequest("https://use.needt.app/api/integrations/connect", {
      method: "POST",
      body: JSON.stringify({ toolkit: "notion" }),
    })
  );

describe("connect start on a server without the Composio key", () => {
  it("tells a normal user only that the app is not there yet", async () => {
    role = "user";
    const res = (await call())!;
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).error).toBe("Notion isn't available yet.");
    expect(text).not.toMatch(/COMPOSIO|API_KEY|environment/i);
  });

  it("tells an admin what to add", async () => {
    role = "admin";
    const res = (await call())!;
    expect((await res.json()).error).toBe(
      "Notion needs COMPOSIO_API_KEY in the server environment. Add it, then try again."
    );
  });
});
