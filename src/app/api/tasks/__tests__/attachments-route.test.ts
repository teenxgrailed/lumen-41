import { NextRequest } from "next/server";

import {
  DELETE as DELETE_ROUTE,
  GET as GETFILE_ROUTE,
} from "../[id]/attachments/[attachmentId]/route";
import {
  GET as GET_ROUTE,
  POST as POST_ROUTE,
} from "../[id]/attachments/route";

/** The routes answer a Response; auth failures return early, which the mock never does. */
const POST = async (...a: Parameters<typeof POST_ROUTE>) =>
  (await POST_ROUTE(...a)) as Response;
const GET = async (...a: Parameters<typeof GET_ROUTE>) =>
  (await GET_ROUTE(...a)) as Response;
const GETFILE = async (...a: Parameters<typeof GETFILE_ROUTE>) =>
  (await GETFILE_ROUTE(...a)) as Response;
const DELETE = async (...a: Parameters<typeof DELETE_ROUTE>) =>
  (await DELETE_ROUTE(...a)) as Response;

const db = {
  task: { findFirst: jest.fn(), findUnique: jest.fn() },
  taskAttachment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(async () => ({
    userId: "u1",
    workspace: { dataScope: { mode: "workspace", workspaceId: "w1" } },
  })),
}));

const ctx = (attachmentId?: string) => ({
  params: Promise.resolve({ id: "t1", attachmentId: attachmentId ?? "a1" }),
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n");

function upload(bytes: Buffer | string, name = "x.png", type = "image/png") {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return new NextRequest("http://localhost/api/tasks/t1/attachments", {
    method: "POST",
    body: form,
  });
}

const row = {
  id: "a1",
  name: "x.png",
  mimeType: "image/png",
  size: 10,
  createdAt: new Date("2026-10-16T10:00:00Z"),
};

describe("task attachments routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.task.findFirst.mockResolvedValue({ id: "t1" });
    db.task.findUnique.mockResolvedValue({ isArchived: false });
    db.taskAttachment.count.mockResolvedValue(0);
    db.taskAttachment.create.mockResolvedValue(row);
  });

  it("stores an image and answers with where to read it", async () => {
    const res = await POST(upload(PNG), ctx());
    expect(res.status).toBe(201);
    expect((await res.json()).attachment).toMatchObject({
      id: "a1",
      url: "/api/tasks/t1/attachments/a1",
    });
    expect(db.taskAttachment.create.mock.calls[0][0].data).toMatchObject({
      taskId: "t1",
      userId: "u1",
      mimeType: "image/png",
    });
  });

  it("reads the type from the bytes, not from what the client says", async () => {
    const res = await POST(upload(PDF, "report.png", "image/png"), ctx());
    expect(res.status).toBe(201);
    expect(db.taskAttachment.create.mock.calls[0][0].data).toMatchObject({
      mimeType: "application/pdf",
    });
  });

  it("refuses anything that is not an image or a PDF", async () => {
    const res = await POST(
      upload("<script>alert(1)</script>", "x.png", "image/png"),
      ctx()
    );
    expect(res.status).toBe(415);
    expect(db.taskAttachment.create).not.toHaveBeenCalled();
  });

  it("refuses a file over 4 MB while it streams in", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]);
    const res = await POST(upload(big), ctx());
    expect(res.status).toBe(413);
    expect(db.taskAttachment.create).not.toHaveBeenCalled();
  });

  it("holds at most ten files per task", async () => {
    db.taskAttachment.count.mockResolvedValue(10);
    const res = await POST(upload(PNG), ctx());
    expect(res.status).toBe(409);
  });

  it("does not touch an archived task, or one outside the workspace", async () => {
    db.task.findUnique.mockResolvedValue({ isArchived: true });
    expect((await POST(upload(PNG), ctx())).status).toBe(409);
    db.task.findFirst.mockResolvedValue(null);
    expect((await POST(upload(PNG), ctx())).status).toBe(404);
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/tasks/t1/attachments"),
          ctx()
        )
      ).status
    ).toBe(404);
  });

  it("lists files without their bytes", async () => {
    db.taskAttachment.findMany.mockResolvedValue([row]);
    const res = await GET(
      new NextRequest("http://localhost/api/tasks/t1/attachments"),
      ctx()
    );
    expect((await res.json()).attachments).toHaveLength(1);
    expect(
      db.taskAttachment.findMany.mock.calls[0][0].select
    ).not.toHaveProperty("bytes");
  });

  it("serves the bytes nosniff, sandboxed, and a PDF as a download", async () => {
    db.taskAttachment.findFirst.mockResolvedValue({
      name: "plan.pdf",
      mimeType: "application/pdf",
      bytes: PDF,
    });
    const res = await GETFILE(
      new NextRequest("http://localhost/api/tasks/t1/attachments/a1"),
      ctx()
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("deletes one file, and says 404 for one that is not there", async () => {
    db.taskAttachment.deleteMany.mockResolvedValue({ count: 1 });
    const del = (id: string) =>
      DELETE(
        new NextRequest(`http://localhost/api/tasks/t1/attachments/${id}`, {
          method: "DELETE",
        }),
        ctx(id)
      );
    expect((await del("a1")).status).toBe(204);
    expect(db.taskAttachment.deleteMany).toHaveBeenCalledWith({
      where: { id: "a1", taskId: "t1" },
    });
    db.taskAttachment.deleteMany.mockResolvedValue({ count: 0 });
    expect((await del("nope")).status).toBe(404);
  });
});
