import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SHARE_PAGE, readShare, shareQuery } from "@/lib/needt3/share-target";
import { publicAppUrl } from "@/lib/public-url";

/**
 * The manifest's `share_target` action. Normally the service worker answers
 * this POST itself (it keeps the shared files, then redirects). This handler
 * is for when no worker is in control yet (a first launch, a cleared cache):
 * it keeps the title, text and link and drops the files, then sends the
 * browser to the Share page with a GET, which signs in first when needed
 * (the middleware keeps the query as the callback). It saves nothing.
 */
export async function POST(request: NextRequest) {
  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    form = null;
  }
  const payload = readShare((k) => {
    const v = form?.get(k);
    return typeof v === "string" ? v : null;
  });
  const query = shareQuery(payload);
  return NextResponse.redirect(
    publicAppUrl(`${SHARE_PAGE}${query ? `?${query}` : ""}`, request),
    303
  );
}
