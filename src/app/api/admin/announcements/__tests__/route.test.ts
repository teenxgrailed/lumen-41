import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  setAnnouncementStatus,
  updateAnnouncement,
} from "@/services/popups/announcements";

import { requireAdmin } from "@/lib/auth/api-auth";

import { DELETE, GET as GET_ONE, PATCH } from "../[id]/route";
import { POST as PUBLISH } from "../[id]/publish/route";
import { GET as LIST, POST as CREATE } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/services/admin/audit", () => ({
  adminActorId: jest.fn(),
  recordAdminAudit: jest.fn(),
}));
jest.mock("@/services/popups/announcements");

const ctx = { params: Promise.resolve({ id: "a1" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://needt.test/api/admin/announcements", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const FORBIDDEN = NextResponse.json({ error: "Forbidden" }, { status: 403 });

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requireAdmin).mockResolvedValue(null);
  jest.mocked(adminActorId).mockResolvedValue("admin-1");
});

describe("admin announcements: authorization", () => {
  it("refuses every route to a person who is not an admin", async () => {
    jest.mocked(requireAdmin).mockResolvedValue(FORBIDDEN);
    const responses = await Promise.all([
      LIST(req("GET")),
      CREATE(req("POST", { slug: "x-y", title: "T" })),
      GET_ONE(req("GET"), ctx),
      PATCH(req("PATCH", { title: "T" }), ctx),
      DELETE(req("DELETE"), ctx),
      PUBLISH(req("POST", { published: true }), ctx),
    ]);
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(listAnnouncements).not.toHaveBeenCalled();
    expect(createAnnouncement).not.toHaveBeenCalled();
    expect(updateAnnouncement).not.toHaveBeenCalled();
    expect(deleteAnnouncement).not.toHaveBeenCalled();
    expect(setAnnouncementStatus).not.toHaveBeenCalled();
  });

  it("answers 401 to a signed-out request", async () => {
    jest
      .mocked(requireAdmin)
      .mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    expect((await LIST(req("GET"))).status).toBe(401);
  });
});

describe("admin announcements: behaviour", () => {
  it("lists with stats", async () => {
    jest.mocked(listAnnouncements).mockResolvedValue([
      { id: "a1", stats: { shown: 3, clicked: 1, dismissed: 2 } },
    ] as never);
    const body = await (await LIST(req("GET"))).json();
    expect(body.announcements[0].stats).toEqual({
      shown: 3,
      clicked: 1,
      dismissed: 2,
    });
  });

  it("creates a draft from a valid body", async () => {
    jest
      .mocked(createAnnouncement)
      .mockResolvedValue({ ok: true, announcement: { id: "a1" } } as never);
    const res = await CREATE(
      req("POST", { slug: "whats-new", title: "What's new" })
    );
    expect(res.status).toBe(201);
    expect(createAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "whats-new", secondaryLabel: "Later" })
    );
  });

  it("rejects a body that tries to set the status", async () => {
    const res = await CREATE(
      req("POST", { slug: "whats-new", title: "T", status: "published" })
    );
    expect(res.status).toBe(400);
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it("rejects an external link in a call to action", async () => {
    const res = await CREATE(
      req("POST", {
        slug: "whats-new",
        title: "T",
        primaryCta: { label: "Go", href: "https://evil.test" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects an icon that is not a known one", async () => {
    const res = await CREATE(
      req("POST", {
        slug: "whats-new",
        title: "T",
        bullets: [{ icon: "A", text: "x" }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("answers 409 for a taken slug", async () => {
    jest
      .mocked(createAnnouncement)
      .mockResolvedValue({ ok: false, code: "slug_taken" });
    const res = await CREATE(req("POST", { slug: "whats-new", title: "T" }));
    expect(res.status).toBe(409);
  });

  it("publishes and unpublishes through the publish route", async () => {
    jest
      .mocked(setAnnouncementStatus)
      .mockResolvedValue({ ok: true, announcement: { id: "a1" } } as never);
    expect((await PUBLISH(req("POST", { published: true }), ctx)).status).toBe(
      200
    );
    expect(setAnnouncementStatus).toHaveBeenLastCalledWith("a1", "published");
    await PUBLISH(req("POST", { published: false }), ctx);
    expect(setAnnouncementStatus).toHaveBeenLastCalledWith("a1", "draft");
  });

  it("answers 404 for an announcement that does not exist", async () => {
    jest.mocked(getAnnouncement).mockResolvedValue(null);
    expect((await GET_ONE(req("GET"), ctx)).status).toBe(404);
    jest.mocked(deleteAnnouncement).mockResolvedValue(false);
    expect((await DELETE(req("DELETE"), ctx)).status).toBe(404);
  });
});
