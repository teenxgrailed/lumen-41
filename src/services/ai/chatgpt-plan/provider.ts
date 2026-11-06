import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

import { parseStrictJson } from "../json";
import { parsePrompt, schedulePrompt } from "../prompts";
import {
  type AiProviderReport,
  type ChatGptPlanFallbackReason,
} from "../provider-choice";
import { parseSseJson, parseToolArguments } from "../providers";
import type {
  AIChatRequest,
  AISuggestion,
  AgentTurnEvent,
  AgentTurnRequest,
  ParsedTask,
  SchedulerAI,
  SchedulingContext,
} from "../types";
import {
  CHATGPT_PLAN_MODELS_URL,
  CHATGPT_PLAN_RESPONSES_URL,
  type ChatGptPlanConfig,
} from "./config";
import {
  ChatGptPlanError,
  FALLBACK_KINDS,
  classifyResponsesError,
} from "./errors";
import { getChatGptPlanAccessToken } from "./oauth";
import { buildChatGptPlanRequest } from "./request";

const LOG_SOURCE = "ai-chatgpt-plan";
const STREAM_TIMEOUT_MS = 180_000;
const MODEL_TTL_MS = 10 * 60 * 1000;
const models = new Map<string, { slug: string; at: number }>();

export interface PlanFallback {
  ai: SchedulerAI;
  /** True when this answer counts against Needt's metered actions. */
  charged: boolean;
}

export interface ChatGptPlanProviderOptions {
  userId: string;
  config: ChatGptPlanConfig;
  /** Filled in as the request goes; the route reports it in metadata. */
  report: AiProviderReport;
  /** Needt AI to answer instead; null when the person has none left. */
  fallback?: () => Promise<PlanFallback | null>;
}

const REPORT_REASON: Record<string, ChatGptPlanFallbackReason> = {
  limit: "limit",
  ineligible: "ineligible",
  revoked: "revoked",
  auth: "auth",
  unavailable: "unavailable",
};

const END_STATE: Record<string, AiProviderReport["state"]> = {
  limit: "plan_limit_reached",
  ineligible: "plan_ineligible",
  revoked: "reconnect_required",
  auth: "reconnect_required",
  unavailable: "plan_unavailable",
};

/**
 * Needt AI on the person's own ChatGPT plan, through the Responses API.
 *
 * Fallback rule: when the plan cannot answer (limit, revoked, ineligible,
 * auth, unavailable) and nothing has been yielded yet in the whole turn, the request moves to
 * `options.fallback` (the person's own key, else the hosted quota) and the
 * report says whether that was charged. Once text has been yielded the
 * request cannot move; the failure ends the turn and the report carries the
 * end state (for example `plan_limit_reached`).
 */
export class ChatGptPlanProvider implements SchedulerAI {
  name = "ChatGPT plan";
  private fallbackAi: SchedulerAI | null = null;
  private planDown = false;
  /**
   * Whether anything reached the caller in this turn. The agent loop calls
   * `streamTurn` once per step, so this lives on the instance: a later step
   * that hits the limit must end the turn cleanly, not restart on Needt AI
   * after text or tool calls were already shown.
   */
  private yieldedAny = false;

  constructor(private options: ChatGptPlanProviderOptions) {}

  private async model(accessToken: string): Promise<string> {
    if (this.options.config.model) return this.options.config.model;
    const cached = models.get(this.options.userId);
    if (cached && newDate().getTime() - cached.at < MODEL_TTL_MS)
      return cached.slug;
    let response: Response;
    try {
      response = await fetch(CHATGPT_PLAN_MODELS_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ChatGptPlanError("unavailable", "Could not list models");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw classifyResponsesError(body, response.status);
    const list = Array.isArray(body?.models) ? body.models : [];
    const first = list.find(
      (m: { visibility?: string; slug?: unknown }) =>
        m?.visibility === "list" && typeof m.slug === "string"
    );
    if (!first) throw new ChatGptPlanError("other", "No model is available");
    models.set(this.options.userId, {
      slug: first.slug,
      at: newDate().getTime(),
    });
    return first.slug as string;
  }

  private async post(body: unknown, accessToken: string): Promise<Response> {
    try {
      return await fetch(CHATGPT_PLAN_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
      });
    } catch {
      throw new ChatGptPlanError("unavailable", "Could not reach ChatGPT");
    }
  }

  private async *planTurn(
    input: AgentTurnRequest
  ): AsyncGenerator<AgentTurnEvent> {
    const { userId } = this.options;
    let token = await getChatGptPlanAccessToken(userId);
    if (!token.ok) {
      throw new ChatGptPlanError(
        token.reason === "unavailable" ? "unavailable" : "revoked",
        "ChatGPT connection is not usable"
      );
    }
    const model = await this.model(token.accessToken);
    const body = buildChatGptPlanRequest({ model, turn: input });
    let response = await this.post(body, token.accessToken);
    if (response.status === 401) {
      // One forced refresh, then one retry.
      token = await getChatGptPlanAccessToken(userId, { force: true });
      if (!token.ok) {
        throw new ChatGptPlanError(
          token.reason === "unavailable" ? "unavailable" : "revoked",
          "ChatGPT connection is not usable"
        );
      }
      response = await this.post(body, token.accessToken);
    }
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw classifyResponsesError(
        errorBody,
        response.status,
        response.headers.get("x-request-id")
      );
    }

    const calls = new Map<number, { id: string; name: string; args: string }>();
    let completed = false;
    let index = 0;
    for await (const event of parseSseJson(response)) {
      const type = event.type;
      if (type === "response.output_text.delta") {
        if (typeof event.delta === "string" && event.delta) {
          yield { type: "text", value: event.delta };
        }
      } else if (
        type === "response.output_item.added" ||
        type === "response.output_item.done"
      ) {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === "function_call") {
          const at =
            typeof event.output_index === "number" ? event.output_index : index;
          const entry = calls.get(at) ?? { id: "", name: "", args: "" };
          if (typeof item.call_id === "string") entry.id = item.call_id;
          if (typeof item.name === "string") entry.name = item.name;
          if (typeof item.arguments === "string" && item.arguments) {
            entry.args = item.arguments;
          }
          calls.set(at, entry);
          index = at + 1;
        }
      } else if (type === "response.function_call_arguments.delta") {
        const entry = calls.get(Number(event.output_index));
        if (entry && typeof event.delta === "string") entry.args += event.delta;
      } else if (type === "response.function_call_arguments.done") {
        const entry = calls.get(Number(event.output_index));
        if (entry && typeof event.arguments === "string") {
          entry.args = event.arguments;
        }
      } else if (type === "response.failed") {
        const failed = event.response as Record<string, unknown> | undefined;
        throw classifyResponsesError(
          failed ?? event,
          undefined,
          response.headers.get("x-request-id")
        );
      } else if (type === "error") {
        throw classifyResponsesError(event, undefined);
      } else if (type === "response.incomplete") {
        throw new ChatGptPlanError("other", "Response incomplete");
      } else if (type === "response.completed") {
        completed = true;
        break;
      }
    }
    if (!completed) {
      throw new ChatGptPlanError("other", "Stream ended before completion");
    }
    for (const [at, call] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
      if (!call.name) continue;
      yield {
        type: "tool_call",
        id: call.id || `call_${at}`,
        name: call.name,
        arguments: parseToolArguments(call.args),
        rawArguments: call.args || "{}",
      };
    }
  }

  async *streamTurn(input: AgentTurnRequest): AsyncGenerator<AgentTurnEvent> {
    if (this.fallbackAi?.streamTurn) {
      yield* this.fallbackAi.streamTurn(input);
      return;
    }
    try {
      if (this.planDown) {
        throw new ChatGptPlanError("limit", "Plan unavailable for this turn");
      }
      for await (const event of this.planTurn(input)) {
        this.yieldedAny = true;
        yield event;
      }
      return;
    } catch (error) {
      if (!(error instanceof ChatGptPlanError)) throw error;
      this.planDown = true;
      logger.warn(
        "ChatGPT plan request failed",
        { kind: error.kind, ...error.detail },
        LOG_SOURCE
      );
      const reason = REPORT_REASON[error.kind];
      const state = END_STATE[error.kind];
      if (this.yieldedAny || !FALLBACK_KINDS.has(error.kind) || !reason) {
        this.options.report.used = "none";
        if (state) this.options.report.state = state;
        throw error;
      }
      const fallback = await this.options.fallback?.();
      if (!fallback?.ai.streamTurn) {
        this.options.report.used = "none";
        this.options.report.state = state;
        throw error;
      }
      this.fallbackAi = fallback.ai;
      this.options.report.used = "needt";
      this.options.report.fallback = { reason, charged: fallback.charged };
    }
    yield* this.fallbackAi!.streamTurn!(input);
  }

  private async collect(prompt: string): Promise<string> {
    let text = "";
    for await (const event of this.streamTurn({
      systemPrompt: "Reply with the requested JSON only.",
      messages: [{ role: "user", content: prompt }],
      tools: [],
    })) {
      if (event.type === "text") text += event.value;
    }
    return text;
  }

  async suggestSchedule(input: SchedulingContext): Promise<AISuggestion> {
    return parseStrictJson<AISuggestion>(
      await this.collect(schedulePrompt(input))
    );
  }

  async parseTasks(text: string): Promise<ParsedTask[]> {
    return parseStrictJson<ParsedTask[]>(await this.collect(parsePrompt(text)));
  }

  async *streamChat(input: AIChatRequest): AsyncGenerator<string> {
    for await (const event of this.streamTurn({
      systemPrompt: input.systemPrompt,
      messages: input.messages
        .filter((m) => m.role !== "system")
        .map((m) =>
          m.role === "assistant"
            ? { role: "assistant" as const, content: m.content }
            : { role: "user" as const, content: m.content }
        ),
      tools: [],
    })) {
      if (event.type === "text") yield event.value;
    }
  }
}
