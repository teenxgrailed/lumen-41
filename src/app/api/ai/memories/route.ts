import { NextRequest, NextResponse } from "next/server";

import {
  clearAgentMemories,
  clearAllAgentMemories,
  forgetForUser,
  isLearningEnabled,
  listAgentMemories,
  publicMemory,
  setLearningEnabled,
  updateMemoryForUser,
} from "@/services/ai/memory";
import { runLearning } from "@/services/ai/memory-learning";
import { AgentMemoryKind } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ai-memories-api";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/ai/memories -> { enabled, memories }
 * `enabled` is "Let Needt learn about me" (off by default). The list is
 * readable whether the switch is on or off; while it is off nothing in it is
 * used.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const [enabled, memories] = await Promise.all([
    isLearningEnabled(auth.userId),
    listAgentMemories(auth.userId, auth.workspace!.workspaceId),
  ]);
  return NextResponse.json(
    { enabled, memories: memories.map(publicMemory) },
    { headers: NO_STORE }
  );
}

const switchSchema = z.object({
  enabled: z.boolean(),
  /** With enabled: false: what happens to what was learned. Keep is the default. */
  memories: z.enum(["keep", "delete"]).optional(),
});
const editSchema = z
  .object({
    memoryId: z.string().min(1),
    content: z.string().trim().min(3).max(500).optional(),
    kind: z.nativeEnum(AgentMemoryKind).optional(),
  })
  .refine((value) => value.content !== undefined || value.kind !== undefined, {
    message: "content or kind is required",
  });

/**
 * PATCH { enabled, memories? } -> { enabled, deleted }   the switch
 * PATCH { memoryId, content?, kind? } -> { memory }       edit one line
 * Turning the switch off with `memories: "delete"` deletes every memory in
 * every workspace; without it they are kept (and unused).
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const body = await request.json().catch(() => null);
    const workspaceId = auth.workspace!.workspaceId;

    const edit = editSchema.safeParse(body);
    if (edit.success) {
      const memory = await updateMemoryForUser(
        auth.userId,
        workspaceId,
        edit.data.memoryId,
        { content: edit.data.content, kind: edit.data.kind }
      );
      if (!memory) {
        return NextResponse.json(
          { error: "Memory not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { memory: publicMemory(memory) },
        { headers: NO_STORE }
      );
    }

    const change = switchSchema.safeParse(body);
    if (!change.success) {
      return NextResponse.json(
        { error: "Send { enabled } or { memoryId, content }" },
        { status: 400 }
      );
    }
    await setLearningEnabled(auth.userId, change.data.enabled);
    let deleted = 0;
    if (!change.data.enabled && change.data.memories === "delete") {
      deleted = (await clearAllAgentMemories(auth.userId)).count;
    }
    if (change.data.enabled) {
      // First pass right away, in the background; the answer does not wait.
      void runLearning(auth.userId, auth.workspace!, { background: true });
    }
    return NextResponse.json(
      { enabled: change.data.enabled, deleted },
      { headers: NO_STORE }
    );
  } catch (error) {
    logger.error(
      "Failed to update AI memories",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    const message =
      error instanceof Error &&
      /sensitive|Too small|Too big/i.test(error.message)
        ? "That cannot be saved as a memory."
        : "Failed to update memories";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE { memoryId } or { all: true } -> { deleted } in this workspace. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const input = z
      .object({
        memoryId: z.string().min(1).optional(),
        all: z.boolean().optional(),
      })
      .parse(await request.json());
    if (input.all) {
      const result = await clearAgentMemories(
        auth.userId,
        auth.workspace!.workspaceId
      );
      return NextResponse.json({ deleted: result.count });
    }
    if (!input.memoryId) {
      return NextResponse.json(
        { error: "memoryId is required" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      deleted: (await forgetForUser(
        auth.userId,
        auth.workspace!.workspaceId,
        input.memoryId
      ))
        ? 1
        : 0,
    });
  } catch (error) {
    logger.error(
      "Failed to delete AI memory",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete memory" },
      { status: 400 }
    );
  }
}
