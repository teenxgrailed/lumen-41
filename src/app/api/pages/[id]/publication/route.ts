import { NextRequest, NextResponse } from "next/server";

import {
  getPagePublication,
  publishPage,
  unpublishPage,
} from "@/services/pages/page-publication-service";
import { PageAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { publicAppUrl } from "@/lib/public-url";
import { refuseSandbox } from "@/lib/sandbox/guard";

const LOG_SOURCE = "PagePublicationAPI";
type RouteContext = { params: Promise<{ id: string }> };

function responseForPublication(
  request: NextRequest,
  publication: { token: string; revokedAt: Date | null } | null
) {
  const published = Boolean(publication && !publication.revokedAt);
  return NextResponse.json({
    published,
    url: published
      ? publicAppUrl(`/p/${publication!.token}`, request).toString()
      : null,
  });
}

async function fullAccess(request: NextRequest, pageId: string) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth;
  const access = await resolvePageAccess(
    auth,
    pageId,
    PageAccessRole.FULL_ACCESS
  );
  return access ? auth : null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await fullAccess(request, id);
  if (!auth) {
    return NextResponse.json({ error: "Page access denied" }, { status: 403 });
  }
  if ("response" in auth) return auth.response;
  return responseForPublication(request, await getPagePublication(auth, id));
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await fullAccess(request, id);
  if (!auth) {
    return NextResponse.json({ error: "Page access denied" }, { status: 403 });
  }
  if ("response" in auth) return auth.response;
  const locked = await refuseSandbox(auth.userId, "public_share");
  if (locked) return locked;
  const publication = await publishPage(auth, id);
  if (!publication) {
    return NextResponse.json({ error: "Page access denied" }, { status: 403 });
  }
  return responseForPublication(request, publication);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await fullAccess(request, id);
  if (!auth) {
    return NextResponse.json({ error: "Page access denied" }, { status: 403 });
  }
  if ("response" in auth) return auth.response;
  const publication = await unpublishPage(auth, id);
  return responseForPublication(request, publication);
}
