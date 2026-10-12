import { getServerSession } from "next-auth";

import { DocumentFace } from "@/components/needt3/phone/docs";
import { PageWorkspace } from "@/components/pages/PageWorkspace";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { isDesignV3 } from "@/lib/needt3/design-flag";

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
  // design_v3: the same editor, inside the v3 document chrome (the phone's
  // reader on a phone, the desktop's document screen otherwise).
  if (await isDesignV3()) {
    return <DocumentFace pageId={id}>{editor}</DocumentFace>;
  }
  return editor;
}
