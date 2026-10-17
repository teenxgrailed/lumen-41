import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { DocumentFace } from "@/components/needt3/phone/docs";
import { PageWorkspace } from "@/components/pages/PageWorkspace";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { documentTabTitle } from "@/lib/needt3/item-titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: await documentTabTitle(id) };
}

export const dynamic = "force-dynamic";

export default async function PagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(await getAuthOptions());
  const editorV2 = session?.user?.id
    ? await isFeatureEnabled("editor_v2", session.user.id)
    : false;
  const editor = (
    <PageWorkspace pageId={id} documentFormatVersion={editorV2 ? 2 : 1} />
  );
  // The editor sits inside the document chrome (the phone's reader on a
  // phone, the desktop's document screen otherwise).
  return <DocumentFace pageId={id}>{editor}</DocumentFace>;
}
