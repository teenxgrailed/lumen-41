import type { PageActor } from "@/services/pages/page-service";
import type { Prisma } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import type { AIChatMessage, SchedulerAI } from "../types";
import type { AgentStreamEvent } from "./events";
import {
  type AgentSettings,
  type AgentTurnResult,
  runAgentTurn,
  runConfirmedToolCall,
} from "./loop";

const LOG_SOURCE = "ai-agent-chat";

const FAILED =
  "I could not reach the AI provider. No planner changes were made.";

export interface AgentChatInput {
  ai: SchedulerAI;
  settings: AgentSettings;
  conversationId: string;
  userId: string;
  workspace: WorkspaceAccess;
  pageActor: PageActor;
  history: AIChatMessage[];
  systemPrompt: string;
  /** The destructive call the person just said yes to. */
  confirmedTool: { name: string; arguments: Record<string, unknown> } | null;
  confirmationMessageId: string | null;
  notice?: string;
  signal?: AbortSignal;
}

function line(event: AgentStreamEvent) {
  return JSON.stringify(event) + "\n";
}

/** One agent turn as the NDJSON response /api/ai/chat returns. */
export function agentChatResponse(input: AgentChatInput): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          // The client left; the turn still finishes and is saved.
        }
      };
      emit({
        type: "meta",
        conversationId: input.conversationId,
        notice: input.notice,
      });

      let result: AgentTurnResult | null = null;
      try {
        const base = {
          ai: input.ai,
          settings: input.settings,
          userId: input.userId,
          workspace: input.workspace,
          pageActor: input.pageActor,
          emit,
          signal: input.signal,
        };
        result = input.confirmedTool
          ? await runConfirmedToolCall(base, input.confirmedTool)
          : await runAgentTurn({
              ...base,
              systemPrompt: input.systemPrompt,
              history: input.history.map((message) =>
                message.role === "assistant"
                  ? { role: "assistant" as const, content: message.content }
                  : { role: "user" as const, content: message.content }
              ),
            });
      } catch (error) {
        logger.warn(
          "Agent turn failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }

      let text = result?.text.trim() ? result.text : "";
      if (!text) {
        text = result?.actions.length
          ? result.actions.map((action) => `${action.label}.`).join(" ")
          : FAILED;
        emit({ type: "token", value: text });
      }

      emit({
        type: "done",
        runId: result?.runId ?? null,
        actions: result?.actions ?? [],
        sources: result?.sources ?? [],
        requiresConfirm: Boolean(result?.pending),
        changed: result?.changed ?? false,
        taskId: result?.taskId ?? null,
      });

      try {
        const payload: Prisma.InputJsonValue | undefined = result?.pending
          ? {
              requestedTool: result.pending.tool.name,
              arguments: result.pending.tool
                .arguments as Prisma.InputJsonObject,
            }
          : result
            ? JSON.parse(
                JSON.stringify({
                  runId: result.runId,
                  actions: result.actions,
                  sources: result.sources,
                })
              )
            : undefined;
        if (input.confirmationMessageId && !result?.pending) {
          await prisma.aiMessage.updateMany({
            where: {
              id: input.confirmationMessageId,
              conversationId: input.conversationId,
              userId: input.userId,
              workspaceId: input.workspace.workspaceId,
            },
            data: { requiresConfirm: false },
          });
        }
        await prisma.aiMessage.create({
          data: {
            conversationId: input.conversationId,
            userId: input.userId,
            workspaceId: input.workspace.workspaceId,
            role: "assistant",
            content: text,
            toolName: result?.pending ? "confirmation_required" : null,
            toolPayload: payload,
            requiresConfirm: Boolean(result?.pending),
          },
        });
        await prisma.aiConversation.updateMany({
          where: {
            id: input.conversationId,
            userId: input.userId,
            workspaceId: input.workspace.workspaceId,
          },
          data: { updatedAt: newDate() },
        });
      } catch (error) {
        logger.error(
          "Could not save the agent reply",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
