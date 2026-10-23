import { NextRequest, NextResponse } from "next/server";

import { createPage, updatePage } from "@/services/pages/page-service";
import { writePageBlocks } from "@/services/pages/page-write-path";
import { PageAuthor, PageBlockType, type Prisma } from "@prisma/client";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "PageTemplateInstantiateAPI";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const template = await prisma.pageTemplate.findFirst({
    where: { id, userId: auth.userId },
  });
  if (!template)
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const snapshot = template.snapshot as Prisma.JsonObject;
  const rawBlocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const page = await createPage(auth, {
    title:
      typeof body.title === "string"
        ? body.title
        : typeof snapshot.title === "string"
          ? snapshot.title
          : template.name,
    parentId: typeof body.parentId === "string" ? body.parentId : null,
    icon: typeof snapshot.icon === "string" ? snapshot.icon : null,
    // not private unless asked: the assistant never reads a Private page
    isPrivate: body.isPrivate === true,
  });
  const blocks = rawBlocks.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const candidate = raw as Prisma.JsonObject;
    if (
      typeof candidate.type !== "string" ||
      !Object.values(PageBlockType).includes(candidate.type as PageBlockType)
    )
      return [];
    return [
      {
        type: candidate.type as PageBlockType,
        content:
          candidate.content === undefined
            ? ({ text: "" } as Prisma.InputJsonValue)
            : (candidate.content as Prisma.InputJsonValue),
        position:
          typeof candidate.position === "number"
            ? candidate.position
            : (index + 1) * 1024,
        createdBy:
          candidate.createdBy === PageAuthor.AI
            ? PageAuthor.AI
            : PageAuthor.HUMAN,
      },
    ];
  });
  const hydrated = await writePageBlocks(
    auth,
    page.id,
    blocks.length > 0
      ? blocks
      : [
          {
            type: PageBlockType.PARAGRAPH,
            content: { text: "" },
            position: 1024,
          },
        ]
  );
  if (typeof snapshot.coverUrl === "string") {
    await updatePage(auth, page.id, {
      coverUrl: snapshot.coverUrl,
    });
  }
  return NextResponse.json({ page: hydrated }, { status: 201 });
}
