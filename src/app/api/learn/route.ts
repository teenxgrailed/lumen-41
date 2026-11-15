import { NextRequest } from "next/server";

import { learnAuth, learnRespond } from "@/services/learn/http";
import { learnOverview } from "@/services/learn/store";

const LOG_SOURCE = "learn-route";

/**
 * GET -> { topics, today }: the person's topics with their lessons (no
 * bodies) and today's finished count with the Free cap (null on Pro). An
 * empty `topics` means the screen shows the built-in samples. Session or a
 * `needt_` token.
 */
export async function GET(request: NextRequest) {
  const auth = await learnAuth(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return learnRespond(LOG_SOURCE, () => learnOverview(auth.userId));
}
