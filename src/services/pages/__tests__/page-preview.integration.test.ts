import { listPages } from "@/services/pages/page-service";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

const describeIntegration =
  process.env.PAGE_PREVIEW_INTEGRATION === "1" ? describe : describe.skip;

const runId = `prev${Date.now().toString(36)}`;
const id = (name: string) => `${runId}-${name}`;

function actor(userId: string, workspaceId: string, role: WorkspaceRole) {
  const workspace: WorkspaceAccess = {
    enabled: true,
    workspaceId,
    workspaceKind: WorkspaceKind.SHARED,
    role,
    dataScope: { mode: "workspace", workspaceId },
  };
  return { userId, workspace };
}

const para = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

describeIntegration("pages list preview (real database)", () => {
  const owner = actor(id("owner"), id("ws"), WorkspaceRole.OWNER);
  const viewer = actor(id("viewer"), id("ws"), WorkspaceRole.VIEWER);
  const outsider = actor(id("outsider"), id("other-ws"), WorkspaceRole.OWNER);

  beforeAll(async () => {
    await prisma.user.createMany({
      data: ["owner", "viewer", "outsider"].map((name) => ({
        id: id(name),
        email: `${id(name)}@example.test`,
      })),
    });
    await prisma.workspace.createMany({
      data: [
        { id: id("ws"), name: "Team", kind: WorkspaceKind.SHARED },
        { id: id("other-ws"), name: "Other", kind: WorkspaceKind.SHARED },
      ],
    });
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: id("ws"), userId: id("owner"), role: "OWNER" },
        { workspaceId: id("ws"), userId: id("viewer"), role: "VIEWER" },
        {
          workspaceId: id("other-ws"),
          userId: id("outsider"),
          role: "OWNER",
        },
      ],
    });
    const page = (name: string, extra: Record<string, unknown> = {}) => ({
      id: id(name),
      userId: id("owner"),
      workspaceId: id("ws"),
      title: name,
      ...extra,
    });
    await prisma.page.create({
      data: page("rich", {
        blocks: {
          create: [
            {
              type: "HEADING_2",
              position: 2048,
              content: {
                json: {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Scope" }],
                },
              },
            },
            {
              type: "PARAGRAPH",
              position: 1024,
              content: { json: para("First words") },
            },
            {
              type: "CHECKLIST",
              position: 3072,
              content: {
                json: {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: true },
                      content: [para("Done thing")],
                    },
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [para("Open thing")],
                    },
                  ],
                },
              },
            },
            // A child block never shows in the preview.
          ],
        },
      }),
    });
    await prisma.page.create({
      data: page("legacy", {
        blocks: {
          create: [
            { type: "PARAGRAPH", position: 1, content: { text: "Plain text" } },
            {
              type: "QUOTE",
              position: 2,
              content: { html: "<p>Quoted &amp; <b>bold</b></p>" },
            },
          ],
        },
      }),
    });
    await prisma.page.create({
      data: page("huge", {
        blocks: {
          create: [
            {
              type: "PARAGRAPH",
              position: 1,
              content: {
                json: {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Big start " + "x".repeat(20_000) },
                  ],
                },
              },
            },
            {
              type: "DIVIDER",
              position: 2,
              content: { json: { type: "horizontalRule" } },
            },
          ],
        },
      }),
    });
    await prisma.page.create({ data: page("empty") });
    await prisma.page.create({
      data: page("secret", {
        isPrivate: true,
        blocks: {
          create: {
            type: "PARAGRAPH",
            position: 1,
            content: { json: para("Private words") },
          },
        },
      }),
    });
    await prisma.page.create({
      data: page("trashed", {
        trashedAt: new Date(),
        blocks: {
          create: {
            type: "PARAGRAPH",
            position: 1,
            content: { json: para("In the trash") },
          },
        },
      }),
    });
    await prisma.page.create({
      data: page("many", {
        blocks: {
          create: Array.from({ length: 400 }, (_, i) => ({
            type: "PARAGRAPH" as const,
            position: (i + 1) * 1024,
            content: { json: para(`Block ${i + 1}`) },
          })),
        },
      }),
    });
  });

  afterAll(async () => {
    await prisma.page.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.workspace.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.$disconnect();
  });

  it("draws every page's first blocks in position order", async () => {
    const pages = await listPages(owner, { preview: true });
    const by = (name: string) => pages.find((p) => p.id === id(name));

    expect(by("rich")?.preview).toEqual([
      { type: "p", text: "First words" },
      { type: "h2", text: "Scope" },
      { type: "todo", text: "Done thing", checked: true },
      { type: "todo", text: "Open thing" },
    ]);
    expect(by("legacy")?.preview).toEqual([
      { type: "p", text: "Plain text" },
      { type: "quote", text: "Quoted & bold" },
    ]);
    expect(by("empty")?.preview).toEqual([]);
    expect(by("many")?.preview).toHaveLength(8);
    expect(by("many")?.preview?.[0]).toEqual({ type: "p", text: "Block 1" });
  });

  it("reads only the start of a block too large to load", async () => {
    const pages = await listPages(owner, { preview: true });
    const huge = pages.find((p) => p.id === id("huge"))?.preview;
    expect(huge?.[0].type).toBe("p");
    expect(huge?.[0].text.startsWith("Big start xxx")).toBe(true);
    expect(huge?.[0].text.length).toBeLessThanOrEqual(120);
    expect(huge?.[1]).toEqual({ type: "rule", text: "" });
  });

  it("follows the list's own access rules", async () => {
    const mine = await listPages(owner, { preview: true });
    expect(mine.find((p) => p.id === id("secret"))?.preview?.[0].text).toBe(
      "Private words"
    );
    // The viewer is a workspace member but the page is private and ungranted.
    const theirs = await listPages(viewer, { preview: true });
    expect(theirs.map((p) => p.id)).not.toContain(id("secret"));
    expect(JSON.stringify(theirs)).not.toContain("Private words");
    // A different workspace sees none of it.
    const other = await listPages(outsider, { preview: true });
    expect(other.filter((p) => p.id.startsWith(runId))).toEqual([]);
    expect(JSON.stringify(other)).not.toContain("words");
  });

  it("leaves the preview off by default, off the trash, and off when asked", async () => {
    const plain = await listPages(owner);
    expect(plain.every((p) => !("preview" in p))).toBe(true);
    const trash = await listPages(owner, { trashed: true, preview: true });
    expect(trash.map((p) => p.id)).toContain(id("trashed"));
    expect(trash.every((p) => !("preview" in p))).toBe(true);
  });
});
