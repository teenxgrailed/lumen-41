import { NextRequest } from "next/server";

import {
  invalid,
  learnAuth,
  learnBody,
  learnRespond,
} from "@/services/learn/http";
import { getLesson, setLessonStatus } from "@/services/learn/store";

import { learnLessonPatchSchema } from "@/lib/learn/schema";

const LOG_SOURCE = "learn-lesson-route";

type Params = { params: Promise<{ id: string }> };

/** GET -> the lesson with its body. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await learnAuth(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return learnRespond(LOG_SOURCE, () => getLesson(auth.userId, id));
}

/**
 * PATCH { status: "done" | "new" } -> the lesson. On Free a second lesson
 * finished in one day answers 403 UPGRADE_REQUIRED.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await learnAuth(request, LOG_SOURCE, { write: true });
  if ("response" in auth) return auth.response;
  return learnRespond(LOG_SOURCE, async () => {
    const patch = learnLessonPatchSchema.safeParse(await learnBody(request));
    if (!patch.success)
      invalid("status must be done or new", patch.error.issues);
    return setLessonStatus(auth.userId, id, patch.data.status);
  });
}
