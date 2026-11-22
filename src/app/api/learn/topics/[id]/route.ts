import { NextRequest } from "next/server";

import {
  invalid,
  learnAuth,
  learnBody,
  learnRespond,
} from "@/services/learn/http";
import { deleteTopic, getTopic, updateTopic } from "@/services/learn/store";

import { learnTopicPatchSchema } from "@/lib/learn/schema";

const LOG_SOURCE = "learn-topic-route";

type Params = { params: Promise<{ id: string }> };

/** GET -> the topic with every lesson and its body. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await learnAuth(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return learnRespond(LOG_SOURCE, () => getTopic(auth.userId, id));
}

/** PATCH { title?, color?, icon?, goal?, level?, order? } -> the topic. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await learnAuth(request, LOG_SOURCE, { write: true });
  if ("response" in auth) return auth.response;
  return learnRespond(LOG_SOURCE, async () => {
    const patch = learnTopicPatchSchema.safeParse(await learnBody(request));
    if (!patch.success) invalid("Invalid topic fields", patch.error.issues);
    return updateTopic(auth.userId, id, patch.data);
  });
}

/** DELETE -> { deleted: true }; the topic's lessons go with it. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await learnAuth(request, LOG_SOURCE, { write: true });
  if ("response" in auth) return auth.response;
  return learnRespond(LOG_SOURCE, async () => {
    await deleteTopic(auth.userId, id);
    return { deleted: true };
  });
}
