import { NextRequest, NextResponse } from "next/server";

import { agentChatResponse } from "@/services/ai/agent/chat-turn";
import { type ToolResult, executeTool } from "@/services/ai/agent/legacy-tools";
import { buildAgentPromptForUser } from "@/services/ai/context";
import {
  getConfiguredSchedulerAI,
  getPreparedSchedulerAI,
} from "@/services/ai/settings";
import {
  HOSTED_AI_BUSY_MESSAGE,
  HOSTED_AI_RESTING_MESSAGE,
  HostedAiQueueError,
} from "@/services/ai/slow-queue";
import {
  getAgentToolDefinitions,
  isDangerousAgentTool,
} from "@/services/ai/tool-catalog";
import {
  AIChatMessage,
  AIChatRequest,
  AIChatToolCall,
} from "@/services/ai/types";
import { publicHostedAiUsage } from "@/services/ai/usage";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "ai-chat";

function titleFromMessage(message: string) {
  return message.trim().slice(0, 42) || "New chat";
}

function fallbackToolFromMessage(message: string): AIChatToolCall | null {
  const lower = message.toLowerCase();

  const createMatch = message.match(
    /create (?:a )?task(?: called| named)? (.+)/i
  );
  if (createMatch?.[1]) {
    return {
      name: "create_task",
      arguments: {
        title: createMatch[1].replace(/[.!?]$/, "").slice(0, 160),
        autoSchedule: true,
      },
    };
  }

  if (lower.includes("schedule") || lower.includes("reschedule")) {
    return { name: "auto_schedule", arguments: { reason: message } };
  }

  if (lower.includes("what should i work on") || lower.includes("next")) {
    return { name: "query_schedule", arguments: { limit: 5 } };
  }

  return null;
}

async function recentMessages(
  conversationId: string,
  workspaceId: string
): Promise<AIChatMessage[]> {
  const messages = await prisma.aiMessage.findMany({
    where: { conversationId, workspaceId },
    orderBy: { createdAt: "desc" },
    take: 16,
  });

  return messages
    .reverse()
    .filter(
      (message) => message.role === "user" || message.role === "assistant"
    )
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));
}

function streamText(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  text: string
) {
  for (const token of text.split(/(\s+)/)) {
    controller.enqueue(
      encoder.encode(JSON.stringify({ type: "token", value: token }) + "\n")
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const limited = await enforceRateLimits(
    [
      ipRule(request, "ai-chat:ip", 60, 60),
      accountRule(auth.userId, "ai-chat:account", 30, 60),
    ],
    { route: "/api/ai/chat", userId: auth.userId }
  );
  if (limited) return limited;

  const body = await request.json();
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const confirmed = Boolean(body.confirmed);
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const configured = await getConfiguredSchedulerAI(auth.userId);
  if (configured.source === "none") {
    const upgradeRequired = configured.usage.plan === "FREE";
    return NextResponse.json(
      {
        error: upgradeRequired
          ? "The AI agent is available on Needt Pro and Lifetime."
          : configured.usage.exhausted
            ? HOSTED_AI_RESTING_MESSAGE
            : "Hosted AI is unavailable. Add your own provider key in Settings.",
        code: upgradeRequired
          ? "UPGRADE_REQUIRED"
          : configured.usage.exhausted
            ? "HOSTED_LIMIT_REACHED"
            : "AI_UNAVAILABLE",
        upgradeRequired,
        usage: publicHostedAiUsage(configured.usage),
      },
      { status: upgradeRequired ? 403 : 409 }
    );
  }

  const requestedConversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : null;
  let conversation = requestedConversationId
    ? await prisma.aiConversation.findFirst({
        where: {
          id: requestedConversationId,
          userId: auth.userId,
          workspaceId: auth.workspace!.workspaceId,
        },
      })
    : null;
  if (requestedConversationId && !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  let confirmedTool: AIChatToolCall | null = null;
  let confirmationMessageId: string | null = null;
  if (confirmed) {
    if (!conversation) {
      return NextResponse.json(
        { error: "The confirmation expired. Ask to perform the action again." },
        { status: 409 }
      );
    }
    const confirmation = await prisma.aiMessage.findFirst({
      where: {
        conversationId: conversation.id,
        userId: auth.userId,
        workspaceId: auth.workspace!.workspaceId,
        role: "assistant",
        toolName: "confirmation_required",
        requiresConfirm: true,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, toolPayload: true },
    });
    const payload = confirmation?.toolPayload;
    if (
      !confirmation ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      typeof payload.requestedTool !== "string" ||
      !payload.arguments ||
      typeof payload.arguments !== "object" ||
      Array.isArray(payload.arguments)
    ) {
      return NextResponse.json(
        { error: "The confirmation expired. Ask to perform the action again." },
        { status: 409 }
      );
    }
    confirmedTool = {
      name: payload.requestedTool,
      arguments: payload.arguments as Record<string, unknown>,
    };
    confirmationMessageId = confirmation.id;
  }

  let prepared: Awaited<ReturnType<typeof getPreparedSchedulerAI>>;
  try {
    prepared = await getPreparedSchedulerAI(auth.userId, configured);
  } catch (error) {
    if (error instanceof HostedAiQueueError) {
      return NextResponse.json(
        { error: HOSTED_AI_BUSY_MESSAGE, code: "HOSTED_AI_BUSY" },
        { status: 503, headers: { "Retry-After": "2" } }
      );
    }
    throw error;
  }
  const { settings, ai, source, usage, hostedMode } = prepared;
  if (source === "none") {
    const upgradeRequired = usage.plan === "FREE";
    return NextResponse.json(
      {
        error: upgradeRequired
          ? "The AI agent is available on Needt Pro and Lifetime."
          : usage.exhausted
            ? HOSTED_AI_RESTING_MESSAGE
            : "Hosted AI is unavailable. Add your own provider key in Settings.",
        code: upgradeRequired
          ? "UPGRADE_REQUIRED"
          : usage.exhausted
            ? "HOSTED_LIMIT_REACHED"
            : "AI_UNAVAILABLE",
        upgradeRequired,
        usage: publicHostedAiUsage(usage),
      },
      { status: upgradeRequired ? 403 : 409 }
    );
  }

  conversation ??= await prisma.aiConversation.create({
    data: {
      userId: auth.userId,
      workspaceId: auth.workspace!.workspaceId,
      title: titleFromMessage(message),
    },
  });

  await prisma.aiMessage.create({
    data: {
      conversationId: conversation.id,
      userId: auth.userId,
      workspaceId: auth.workspace!.workspaceId,
      role: "user",
      content: message,
    },
  });

  const history = await recentMessages(
    conversation.id,
    auth.workspace!.workspaceId
  );
  const systemPrompt = await buildAgentPromptForUser(
    auth.userId,
    settings.soulPreset,
    auth.workspace!
  );
  if (ai.streamTurn) {
    // Providers that can stream tool calls run the multi-step agent: every
    // write is an op (logged, undoable) and progress streams as it happens.
    return agentChatResponse({
      ai,
      settings,
      conversationId: conversation.id,
      userId: auth.userId,
      workspace: auth.workspace!,
      pageActor: auth,
      history,
      systemPrompt,
      confirmedTool,
      confirmationMessageId,
      notice: hostedMode === "slow" ? HOSTED_AI_BUSY_MESSAGE : undefined,
      signal: request.signal,
    });
  }
  const tools = getAgentToolDefinitions(settings);
  const chatRequest: AIChatRequest = {
    systemPrompt,
    messages: history,
    tools,
  };

  let toolResult: ToolResult | null = null;
  let selectedTool: AIChatToolCall | null = confirmedTool;
  if (!selectedTool) {
    try {
      selectedTool = (await ai.selectChatTool?.(chatRequest)) || null;
    } catch (error) {
      logger.warn(
        "AI tool selection failed; using local fallback",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      selectedTool = fallbackToolFromMessage(message);
    }
  }

  if (!selectedTool) {
    selectedTool = fallbackToolFromMessage(message);
  }

  if (
    selectedTool &&
    isDangerousAgentTool(selectedTool.name, selectedTool.arguments) &&
    auth.workspace?.role === WorkspaceRole.VIEWER
  ) {
    return NextResponse.json(
      {
        error: "An Editor or Owner role is required for this AI action.",
        code: "WORKSPACE_ROLE_REQUIRED",
      },
      { status: 403 }
    );
  }

  if (selectedTool && tools.some((tool) => tool.name === selectedTool?.name)) {
    toolResult = await executeTool(
      ai,
      selectedTool,
      auth.userId,
      auth.workspace!,
      confirmed,
      auth
    );
    if (confirmationMessageId && !toolResult.requiresConfirm) {
      await prisma.aiMessage.updateMany({
        where: {
          id: confirmationMessageId,
          conversationId: conversation.id,
          userId: auth.userId,
          workspaceId: auth.workspace!.workspaceId,
        },
        data: { requiresConfirm: false },
      });
    }
  }

  const finalRequest: AIChatRequest = {
    systemPrompt,
    messages: toolResult
      ? [
          ...history,
          {
            role: "assistant",
            content: `Server tool result (${toolResult.toolName}): ${toolResult.text}`,
          },
        ]
      : history,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";

      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            type: "meta",
            conversationId: conversation.id,
            requiresConfirm: toolResult?.requiresConfirm || false,
            toolName: toolResult?.toolName || null,
            toolPayload: toolResult?.toolPayload || null,
            notice: hostedMode === "slow" ? HOSTED_AI_BUSY_MESSAGE : undefined,
          }) + "\n"
        )
      );

      try {
        if (toolResult?.requiresConfirm) {
          assistantText = toolResult.text;
          streamText(controller, encoder, assistantText);
        } else if (ai.streamChat) {
          for await (const token of ai.streamChat(finalRequest)) {
            assistantText += token;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "token", value: token }) + "\n"
              )
            );
          }
        }

        if (!assistantText.trim()) {
          assistantText =
            toolResult?.text ||
            "I handled the request, but the provider returned no text.";
          streamText(controller, encoder, assistantText);
        }
      } catch {
        assistantText =
          toolResult?.text ||
          "I could not reach the AI provider. No planner changes were made.";
        streamText(controller, encoder, assistantText);
      }

      await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          userId: auth.userId,
          workspaceId: auth.workspace!.workspaceId,
          role: "assistant",
          content: assistantText,
          toolName: toolResult?.toolName,
          toolPayload: toolResult?.toolPayload,
          requiresConfirm: toolResult?.requiresConfirm || false,
        },
      });
      await prisma.aiConversation.updateMany({
        where: {
          id: conversation.id,
          userId: auth.userId,
          workspaceId: auth.workspace!.workspaceId,
        },
        data: { updatedAt: newDate() },
      });
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
