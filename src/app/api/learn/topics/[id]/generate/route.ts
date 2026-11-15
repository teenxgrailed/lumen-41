import { NextRequest } from "next/server";

import { generateLessons } from "@/services/learn/generate";
import { learnAuth, learnRespond } from "@/services/learn/http";
import { addLessons, getTopic, isProLearner } from "@/services/learn/store";
import { OpError } from "@/services/ops";

import { LEARN_LIMITS } from "@/lib/learn/schema";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "learn-generate-route";

type Params = { params: Promise<{ id: string }> };

/**
 * POST -> { status, topic? }: about five new lessons for the topic, written by
 * the AI and validated before anything is stored (Pro; one AI action per
 * call, 6 calls an hour). `upgrade` on Free (no AI), `unavailable` when no AI
 * can answer, `invalid` when its answer did not validate; none of those
 * changes the topic.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await learnAuth(request, LOG_SOURCE, { write: true });
  if ("response" in auth) return auth.response;

  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "learn-generate:account", 6, 3600)],
    { route: "/api/learn/topics/[id]/generate", userId: auth.userId }
  );
  if (limited) return limited;

  return learnRespond(LOG_SOURCE, async () => {
    // Ownership first: a foreign id is NOT_FOUND before any AI is spent.
    const topic = await getTopic(auth.userId, id);
    // The lesson cap is checked before any AI is spent.
    if (
      topic.lessons.length + LEARN_LIMITS.generate >
      LEARN_LIMITS.lessonsPerTopic
    )
      throw new OpError("CONFLICT", "This topic has too many lessons");
    const outcome = await generateLessons(
      auth.userId,
      {
        title: topic.title,
        goal: topic.goal,
        level: topic.level,
        existing: topic.lessons.map((l) => l.title),
      },
      await isProLearner(auth.userId)
    );
    if (outcome.status !== "ready") return { status: outcome.status };
    return {
      status: "ready",
      topic: await addLessons(auth.userId, id, outcome.lessons, "AI"),
    };
  });
}
