import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";
import { runAdminUserAction } from "@/services/admin/user-actions";

import { requireAdmin } from "@/lib/auth/api-auth";

import { POST } from "../[id]/actions/route";
import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/admin/users", () => ({
  searchAdminUsers: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/admin/audit", () => ({
  adminActorId: jest.fn(),
  listAuditForUser: jest.fn(),
}));
jest.mock("@/services/admin/user-actions", () => {
  const actual = jest.requireActual("@/services/admin/user-actions");
  return { ...actual, runAdminUserAction: jest.fn() };
});

const ctx = { params: Promise.resolve({ id: "u2" }) };
const post = (body: unknown) =>
  new NextRequest("http://needt.test/api/admin/users/u2/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });

const refuse = () =>
  (requireAdmin as jest.Mock).mockResolvedValue(
    NextResponse.json({ error: "Forbidden" }, { status: 403 })
  );

beforeEach(() => {
  jest.clearAllMocks();
  (requireAdmin as jest.Mock).mockResolvedValue(null);
  (adminActorId as jest.Mock).mockResolvedValue("admin-1");
});

describe("admin users API", () => {
  it("refuses a non-admin on search and on actions", async () => {
    refuse();
    expect(
      (await GET(new NextRequest("http://needt.test/api/admin/users"))).status
    ).toBe(403);
    expect(
      (await POST(post({ action: "sign_out_everywhere" }), ctx)).status
    ).toBe(403);
    expect(runAdminUserAction).not.toHaveBeenCalled();
  });

  it("rejects an action it does not know, before running anything", async () => {
    const response = await POST(post({ action: "drop_database" }), ctx);
    expect(response.status).toBe(400);
    expect(runAdminUserAction).not.toHaveBeenCalled();
  });

  it("rejects days out of range", async () => {
    const response = await POST(
      post({ action: "extend_trial", days: 100000 }),
      ctx
    );
    expect(response.status).toBe(400);
  });

  it("runs the action as the signed-in admin", async () => {
    (runAdminUserAction as jest.Mock).mockResolvedValue({ message: "ok" });
    const response = await POST(
      post({ action: "set_admin", admin: true }),
      ctx
    );
    expect(response.status).toBe(200);
    expect(runAdminUserAction).toHaveBeenCalledWith("admin-1", "u2", {
      action: "set_admin",
      admin: true,
    });
  });

  it("passes the service's own refusal through with its status", async () => {
    const { AdminActionError } = jest.requireActual(
      "@/services/admin/user-actions"
    );
    (runAdminUserAction as jest.Mock).mockRejectedValue(
      new AdminActionError(400, "You cannot remove your own admin role.")
    );
    const response = await POST(
      post({ action: "set_admin", admin: false }),
      ctx
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/own admin role/);
  });
});
