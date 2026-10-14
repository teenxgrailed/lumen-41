import { NextRequest } from "next/server";

import { GET } from "../route";

const updateMany = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: {
    externalIntegration: {
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const call = (query: string) =>
  GET(
    new NextRequest(`https://use.needt.app/api/integrations/callback?${query}`)
  );

beforeEach(() => updateMany.mockReset());

describe("the Composio callback", () => {
  it("marks the toolkit connected when the provider said success", async () => {
    const res = await call("toolkit=notion&status=success");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", provider: "composio", toolkit: "notion" },
      })
    );
    expect(res?.headers.get("location")).toContain("/settings#integrations");
  });

  it("marks it connected when no status is sent", async () => {
    await call("toolkit=notion");
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("leaves it disconnected when the person cancelled", async () => {
    const res = await call("toolkit=notion&status=failed");
    expect(updateMany).not.toHaveBeenCalled();
    expect(res?.headers.get("location")).toContain("/settings#integrations");
  });
});
