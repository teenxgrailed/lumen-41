import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/customization/route";
import { Prisma } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userCustomization: {
      findUnique: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const customizations = prisma.userCustomization as unknown as {
  findUnique: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
};

describe("customization API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "user-1" });
    customizations.findUnique.mockResolvedValue({ userId: "user-1" });
    customizations.update.mockResolvedValue({ userId: "user-1" });
  });

  it("accepts the nullable design token value returned by the settings API", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/customization", {
        method: "PATCH",
        body: JSON.stringify({
          accentColor: "#6366F1",
          designTokens: null,
        }),
      })
    );
    if (!response) throw new Error("Expected a response");

    expect(response.status).toBe(200);
    expect(customizations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ designTokens: Prisma.DbNull }),
      })
    );
  });
});
