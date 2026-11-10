import { NextRequest } from "next/server";

import { POST } from "@/app/api/integrations/disconnect/route";
import { composioProvider } from "@/services/integrations/composio-provider";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/integrations/composio-provider", () => ({
  composioProvider: { revokeConnection: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    externalIntegration: {
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

function disconnect() {
  return POST(
    new NextRequest("http://localhost/api/integrations/disconnect", {
      method: "POST",
      body: JSON.stringify({ id: "int-1" }),
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(prisma.externalIntegration.findFirst)
    .mockResolvedValue({
      id: "int-1",
      externalConnectionId: "conn-1",
    } as never);
  jest.mocked(prisma.externalIntegration.count).mockResolvedValue(0);
  jest
    .mocked(prisma.externalIntegration.updateMany)
    .mockResolvedValue({ count: 1 });
});

describe("POST /api/integrations/disconnect", () => {
  it("revokes the provider grant and marks the row disconnected", async () => {
    jest.mocked(composioProvider.revokeConnection).mockResolvedValue(true);
    const response = await disconnect();
    expect(composioProvider.revokeConnection).toHaveBeenCalledWith("conn-1");
    expect(prisma.externalIntegration.updateMany).toHaveBeenCalled();
    await expect(response!.json()).resolves.toMatchObject({
      success: true,
      revoked: true,
    });
  });

  it("still disconnects locally when the revoke throws", async () => {
    jest
      .mocked(composioProvider.revokeConnection)
      .mockRejectedValue(new Error("boom"));
    const response = await disconnect();
    expect(response!.status).toBe(200);
    expect(prisma.externalIntegration.updateMany).toHaveBeenCalled();
  });

  it("does not revoke a connection another row still uses", async () => {
    jest.mocked(prisma.externalIntegration.count).mockResolvedValue(1);
    await disconnect();
    expect(composioProvider.revokeConnection).not.toHaveBeenCalled();
    expect(prisma.externalIntegration.updateMany).toHaveBeenCalled();
  });
});
