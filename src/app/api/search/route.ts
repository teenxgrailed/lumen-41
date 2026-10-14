import { NextRequest, NextResponse } from "next/server";

import { searchWorkspace } from "@/services/search/workspace-search";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "global-search";

const RESULT_LABEL = { task: "Task", project: "Project", event: "Event" };
const RESULT_HREF = { task: "/tasks", project: "/tasks", event: "/calendar" };

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const hits = await searchWorkspace({
    userId: auth.userId,
    workspace: auth.workspace,
    query: q,
    take: 6,
    types: ["task", "project", "event"],
  });

  return NextResponse.json({
    results: hits.map((hit) => {
      const type = hit.type as keyof typeof RESULT_LABEL;
      return {
        id: hit.id,
        type: RESULT_LABEL[type],
        title: hit.title,
        href: RESULT_HREF[type],
      };
    }),
  });
}
