import { NextRequest, NextResponse } from "next/server";

import * as acceptRoute from "@/app/api/workspace-invites/accept/route";
import * as declineRoute from "@/app/api/workspace-invites/decline/route";
import * as inviteRoute from "@/app/api/workspaces/[id]/invites/[inviteId]/route";
import * as invitesRoute from "@/app/api/workspaces/[id]/invites/route";
import * as leaveRoute from "@/app/api/workspaces/[id]/leave/route";
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
  inviteWorkspaceMember,
  leaveWorkspace,
  revokeWorkspaceInvite,
} from "@/services/workspaces/workspace-service";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/sandbox/guard", () => ({
  refuseSandbox: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((identifier, namespace, limit, windowSeconds) => ({
    identifier,
    namespace,
    limit,
    windowSeconds,
  })),
  enforceRateLimits: jest.fn(),
  ipRule: jest.fn((_request, namespace, limit, windowSeconds) => ({
    identifier: "request-ip",
    namespace,
    limit,
    windowSeconds,
  })),
}));
jest.mock("@/services/workspaces/workspace-service", () => ({
  acceptWorkspaceInvite: jest.fn(),
  declineWorkspaceInvite: jest.fn(),
  inviteWorkspaceMember: jest.fn(),
  leaveWorkspace: jest.fn(),
  listWorkspaceInvites: jest.fn(),
  revokeWorkspaceInvite: jest.fn(),
  WorkspaceServiceError: class WorkspaceServiceError extends Error {},
}));

describe("workspace invite API security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "owner-1" });
    jest.mocked(enforceRateLimits).mockResolvedValue(null);
  });

  it("rate-limits invite creation by IP and authenticated account", async () => {
    jest
      .mocked(inviteWorkspaceMember)
      .mockResolvedValue({ id: "invite-1" } as never);
    const request = new NextRequest(
      "http://localhost/api/workspaces/workspace-1/invites",
      {
        method: "POST",
        body: JSON.stringify({ email: "member@example.com", role: "EDITOR" }),
      }
    );

    const response = await invitesRoute.POST(request, {
      params: Promise.resolve({ id: "workspace-1" }),
    });

    expect(response!.status).toBe(201);
    expect(enforceRateLimits).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ namespace: "workspace-invite:ip" }),
        expect.objectContaining({ namespace: "workspace-invite:account" }),
      ]),
      { route: "/api/workspaces/workspace-1/invites", userId: "owner-1" }
    );
  });

  it("stops invite acceptance before token lookup when limited", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(
        NextResponse.json({ error: "limited" }, { status: 429 })
      );
    const request = new NextRequest(
      "http://localhost/api/workspace-invites/accept",
      {
        method: "POST",
        body: JSON.stringify({ token: "x".repeat(32) }),
      }
    );

    const response = await acceptRoute.POST(request);

    expect(response!.status).toBe(429);
    expect(enforceRateLimits).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ namespace: "workspace-invite-accept:ip" }),
        expect.objectContaining({
          namespace: "workspace-invite-accept:account",
        }),
      ]),
      { route: "/api/workspace-invites/accept", userId: "owner-1" }
    );
    expect(acceptWorkspaceInvite).not.toHaveBeenCalled();
  });

  it("declines an authenticated recipient's invitation", async () => {
    const request = new NextRequest(
      "http://localhost/api/workspace-invites/decline",
      {
        method: "POST",
        body: JSON.stringify({ token: "x".repeat(32) }),
      }
    );

    const response = await declineRoute.POST(request);

    expect(response!.status).toBe(204);
    expect(declineWorkspaceInvite).toHaveBeenCalledWith(
      "owner-1",
      "x".repeat(32)
    );
    expect(enforceRateLimits).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ namespace: "workspace-invite-decline:ip" }),
        expect.objectContaining({
          namespace: "workspace-invite-decline:account",
        }),
      ]),
      { route: "/api/workspace-invites/decline", userId: "owner-1" }
    );
  });

  it("allows a member to leave through the dedicated workspace endpoint", async () => {
    const request = new NextRequest(
      "http://localhost/api/workspaces/workspace-1/leave",
      { method: "POST" }
    );

    const response = await leaveRoute.POST(request, {
      params: Promise.resolve({ id: "workspace-1" }),
    });

    expect(response!.status).toBe(204);
    expect(leaveWorkspace).toHaveBeenCalledWith("owner-1", "workspace-1");
  });

  it("lets an owner revoke an unused invitation", async () => {
    const request = new NextRequest(
      "http://localhost/api/workspaces/workspace-1/invites/invite-1",
      { method: "DELETE" }
    );

    const response = await inviteRoute.DELETE(request, {
      params: Promise.resolve({ id: "workspace-1", inviteId: "invite-1" }),
    });

    expect(response!.status).toBe(204);
    expect(revokeWorkspaceInvite).toHaveBeenCalledWith({
      userId: "owner-1",
      workspaceId: "workspace-1",
      inviteId: "invite-1",
    });
  });
});
