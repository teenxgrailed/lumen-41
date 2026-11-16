import { NextRequest } from "next/server";

import {
  invalid,
  learnAuth,
  learnBody,
  learnRespond,
} from "@/services/learn/http";
import { adoptSample, createTopic } from "@/services/learn/store";

import { learnTopicInputSchema } from "@/lib/learn/schema";

const LOG_SOURCE = "learn-topics-route";

/**
 * POST { title, color?, icon?, goal?, level? } -> the new topic (201).
 * POST { sample: "deutsch" } copies a built-in sample with its lessons
 * ("Make it mine"); doing it twice returns the same topic. No AI either way,
 * so Free can do both. Session or a `needt_` token with `needt.write`.
 */
export async function POST(request: NextRequest) {
  const auth = await learnAuth(request, LOG_SOURCE, { write: true });
  if ("response" in auth) return auth.response;
  return learnRespond(
    LOG_SOURCE,
    async () => {
      const body = (await learnBody(request)) as Record<string, unknown>;
      if (typeof body.sample === "string" && body.sample)
        return adoptSample(auth.userId, body.sample);
      const input = learnTopicInputSchema.safeParse(body);
      if (!input.success)
        invalid(
          "A topic needs a title (80 characters at most)",
          input.error.issues
        );
      return createTopic(auth.userId, input.data);
    },
    201
  );
}
