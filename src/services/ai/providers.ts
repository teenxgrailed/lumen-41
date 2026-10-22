import { UnsafeFetchError, safeFetch } from "@/services/oauth/safe-fetch";

import { aiHostKind } from "./endpoint";
import { parseTasksFallback } from "./fallback-parser";
import { extractProviderText, parseStrictJson } from "./json";
import { parsePrompt, schedulePrompt } from "./prompts";
import {
  AIChatRequest,
  AIChatToolCall,
  AIChatToolDefinition,
  AIProviderUsage,
  AISuggestion,
  AgentMessage,
  AgentTurnEvent,
  AgentTurnRequest,
  ParsedTask,
  SchedulerAI,
  SchedulerAIConfig,
  SchedulingContext,
} from "./types";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SUGGESTION: AISuggestion = {
  summary: "Deterministic schedule kept.",
  moves: [],
  warnings: [],
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function openAIUsage(payload: Record<string, unknown> | null) {
  const usage = asRecord(payload?.usage);
  if (!usage) return null;
  return {
    inputTokens: tokenCount(usage.prompt_tokens),
    outputTokens: tokenCount(usage.completion_tokens),
  } satisfies AIProviderUsage;
}

function anthropicUsage(payload: Record<string, unknown> | null) {
  const usage = asRecord(payload?.usage);
  if (!usage) return null;
  return {
    inputTokens:
      tokenCount(usage.input_tokens) +
      tokenCount(usage.cache_creation_input_tokens) +
      tokenCount(usage.cache_read_input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
  } satisfies AIProviderUsage;
}

async function reportUsage(
  config: SchedulerAIConfig,
  usage: AIProviderUsage | null
) {
  if (!usage || (!usage.inputTokens && !usage.outputTokens)) return;
  await config.onUsage?.(usage);
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value)) || {};
    } catch {
      return {};
    }
  }
  return asRecord(value) || {};
}

function openAITools(tools?: AIChatToolDefinition[]) {
  return tools?.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function* parseSseJson(
  response: Response
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) {
    throw new Error("Provider returned an empty stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const dataLines = chunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      for (const data of dataLines) {
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = asRecord(JSON.parse(data));
          if (parsed) yield parsed;
        } catch {
          // Ignore malformed provider stream fragments.
        }
      }
    }
  }
}

export class NoneProvider implements SchedulerAI {
  name = "Deterministic";

  async suggestSchedule(): Promise<AISuggestion> {
    return DEFAULT_SUGGESTION;
  }

  async parseTasks(text: string): Promise<ParsedTask[]> {
    return parseTasksFallback(text);
  }

  async selectChatTool(): Promise<AIChatToolCall | null> {
    return null;
  }

  async *streamChat(input: AIChatRequest): AsyncGenerator<string> {
    const latest = input.messages[input.messages.length - 1]?.content || "";
    yield latest
      ? `Deterministic mode is enabled. I can still parse local tasks, but chat requires an AI provider. Last message: ${latest}`
      : "Deterministic mode is enabled. Configure an AI provider to use chat.";
  }
}

export class AnthropicProvider implements SchedulerAI {
  name = "Anthropic";

  constructor(private config: SchedulerAIConfig) {}

  private async complete<T>(prompt: string): Promise<T> {
    if (!this.config.apiKey) {
      throw new Error("Anthropic API key is not configured");
    }

    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model || "claude-sonnet-4-6",
          max_tokens: 2000,
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
        }),
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.status}`);
    }

    const payload = asRecord(await response.json());
    await reportUsage(this.config, anthropicUsage(payload));
    return parseStrictJson<T>(extractProviderText(payload));
  }

  suggestSchedule(input: SchedulingContext): Promise<AISuggestion> {
    return this.complete<AISuggestion>(schedulePrompt(input));
  }

  parseTasks(text: string): Promise<ParsedTask[]> {
    return this.complete<ParsedTask[]>(parsePrompt(text));
  }

  async selectChatTool(input: AIChatRequest): Promise<AIChatToolCall | null> {
    if (!this.config.apiKey || !input.tools?.length) return null;

    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model || "claude-sonnet-4-6",
          max_tokens: 600,
          temperature: 0,
          system: input.systemPrompt,
          messages: input.messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
            })),
          tools: input.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          })),
          tool_choice: { type: "auto" },
        }),
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`Anthropic tool request failed: ${response.status}`);
    }

    const payload = asRecord(await response.json());
    await reportUsage(this.config, anthropicUsage(payload));
    const content = Array.isArray(payload?.content) ? payload.content : [];
    for (const block of content) {
      const record = asRecord(block);
      if (record?.type === "tool_use" && typeof record.name === "string") {
        return {
          name: record.name,
          arguments: parseToolArguments(record.input),
        };
      }
    }
    return null;
  }

  async *streamChat(input: AIChatRequest): AsyncGenerator<string> {
    if (!this.config.apiKey) {
      throw new Error("Anthropic API key is not configured");
    }

    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model || "claude-sonnet-4-6",
          max_tokens: 1600,
          temperature: 0.2,
          stream: true,
          system: input.systemPrompt,
          messages: input.messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
            })),
        }),
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`Anthropic chat request failed: ${response.status}`);
    }

    let usage: AIProviderUsage | null = null;
    for await (const payload of parseSseJson(response)) {
      const messageUsage = anthropicUsage(asRecord(payload.message));
      const deltaUsage = anthropicUsage(payload);
      if (messageUsage) usage = messageUsage;
      if (deltaUsage) {
        usage = {
          inputTokens: deltaUsage.inputTokens || usage?.inputTokens || 0,
          outputTokens: deltaUsage.outputTokens,
        };
      }
      const delta = asRecord(payload.delta);
      if (
        payload.type === "content_block_delta" &&
        typeof delta?.text === "string"
      ) {
        yield delta.text;
      }
    }
    await reportUsage(this.config, usage);
  }
}

export class OpenAIProvider implements SchedulerAI {
  name: string;

  constructor(
    private config: SchedulerAIConfig,
    name = "OpenAI",
    private defaultModel = "gpt-4o"
  ) {
    this.name = name;
  }

  private async complete<T>(prompt: string): Promise<T> {
    if (!this.config.apiKey) {
      throw new Error(`${this.name} API key is not configured`);
    }

    const baseUrl = (
      this.config.baseUrl || "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...(this.config.extraBody ?? {}),
          model: this.config.model || this.defaultModel,
          max_tokens: this.config.maxTokens,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`${this.name} request failed: ${response.status}`);
    }

    const payload = asRecord(await response.json());
    await reportUsage(this.config, openAIUsage(payload));
    return parseStrictJson<T>(extractProviderText(payload));
  }

  suggestSchedule(input: SchedulingContext): Promise<AISuggestion> {
    return this.complete<AISuggestion>(schedulePrompt(input));
  }

  parseTasks(text: string): Promise<ParsedTask[]> {
    return this.complete<ParsedTask[]>(parsePrompt(text));
  }

  async selectChatTool(input: AIChatRequest): Promise<AIChatToolCall | null> {
    if (!this.config.apiKey || !input.tools?.length) return null;

    const baseUrl = (
      this.config.baseUrl || "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...(this.config.extraBody ?? {}),
          model: this.config.model || this.defaultModel,
          max_tokens: this.config.maxTokens,
          temperature: 0,
          tool_choice: "auto",
          tools: openAITools(input.tools),
          messages: [
            { role: "system", content: input.systemPrompt },
            ...input.messages.map((message) => ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
            })),
          ],
        }),
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`${this.name} tool request failed: ${response.status}`);
    }

    const payload = asRecord(await response.json());
    await reportUsage(this.config, openAIUsage(payload));
    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice?.message);
    const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    const firstCall = asRecord(calls[0]);
    const fn = asRecord(firstCall?.function);
    if (typeof fn?.name !== "string") return null;

    return {
      name: fn.name,
      arguments: parseToolArguments(fn.arguments),
    };
  }

  /**
   * One streamed turn with tools (OpenAI-compatible, which includes Z.ai and
   * OpenRouter). Text is yielded as it arrives; tool calls are assembled from
   * their argument fragments and yielded once the stream ends. Reasoning
   * deltas (`reasoning_content`) are never shown.
   */
  async *streamTurn(input: AgentTurnRequest): AsyncGenerator<AgentTurnEvent> {
    if (!this.config.apiKey) {
      throw new Error(`${this.name} API key is not configured`);
    }
    const baseUrl = (
      this.config.baseUrl || "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    const zai = aiHostKind(baseUrl) === "zai";
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...(this.config.extraBody ?? {}),
          model: this.config.model || this.defaultModel,
          max_tokens: this.config.maxTokens,
          temperature: 0.2,
          stream: true,
          ...(zai ? { tool_stream: true } : {}),
          ...(this.config.onUsage && !zai
            ? { stream_options: { include_usage: true } }
            : {}),
          ...(input.tools.length
            ? { tools: openAITools(input.tools), tool_choice: "auto" }
            : {}),
          messages: openAIAgentMessages(input.systemPrompt, input.messages),
        }),
      },
      this.config.timeoutMs
    );
    if (!response.ok) {
      throw new Error(`${this.name} agent request failed: ${response.status}`);
    }

    const calls = new Map<number, { id: string; name: string; args: string }>();
    let usage: AIProviderUsage | null = null;
    for await (const payload of parseSseJson(response)) {
      usage = openAIUsage(payload) || usage;
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const delta = asRecord(asRecord(choices[0])?.delta);
      if (typeof delta?.content === "string" && delta.content) {
        yield { type: "text", value: delta.content };
      }
      const fragments = Array.isArray(delta?.tool_calls)
        ? delta.tool_calls
        : [];
      for (const raw of fragments) {
        const fragment = asRecord(raw);
        if (!fragment) continue;
        const index =
          typeof fragment.index === "number" ? fragment.index : calls.size;
        const fn = asRecord(fragment.function);
        const entry = calls.get(index) ?? { id: "", name: "", args: "" };
        if (typeof fragment.id === "string" && fragment.id) {
          entry.id = fragment.id;
        }
        if (typeof fn?.name === "string") entry.name += fn.name;
        if (typeof fn?.arguments === "string") entry.args += fn.arguments;
        calls.set(index, entry);
      }
    }
    await reportUsage(this.config, usage);
    for (const [index, call] of [...calls.entries()].sort(
      (a, b) => a[0] - b[0]
    )) {
      if (!call.name) continue;
      yield {
        type: "tool_call",
        id: call.id || `call_${index}`,
        name: call.name,
        arguments: parseToolArguments(call.args),
        rawArguments: call.args || "{}",
      };
    }
  }

  async *streamChat(input: AIChatRequest): AsyncGenerator<string> {
    if (!this.config.apiKey) {
      throw new Error(`${this.name} API key is not configured`);
    }

    const baseUrl = (
      this.config.baseUrl || "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...(this.config.extraBody ?? {}),
          model: this.config.model || this.defaultModel,
          max_tokens: this.config.maxTokens,
          temperature: 0.2,
          stream: true,
          // Z.ai reports usage on its own; OpenAI-style hosts need asking.
          ...(this.config.onUsage && aiHostKind(baseUrl) !== "zai"
            ? { stream_options: { include_usage: true } }
            : {}),
          messages: [
            { role: "system", content: input.systemPrompt },
            ...input.messages.map((message) => ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
            })),
          ],
        }),
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`${this.name} chat request failed: ${response.status}`);
    }

    let usage: AIProviderUsage | null = null;
    for await (const payload of parseSseJson(response)) {
      usage = openAIUsage(payload) || usage;
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const firstChoice = asRecord(choices[0]);
      const delta = asRecord(firstChoice?.delta);
      if (typeof delta?.content === "string") {
        yield delta.content;
      }
    }
    await reportUsage(this.config, usage);
  }
}

function openAIAgentMessages(
  systemPrompt: string,
  messages: AgentMessage[]
): Record<string, unknown>[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: message.content,
        };
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        };
      }
      return { role: message.role, content: message.content };
    }),
  ];
}

/**
 * The deployment's own endpoint (`AI_CUSTOM_URL`) is the operator's choice,
 * not a person's, and may sit on the internal network. Any other address a
 * person typed in is held to public hosts.
 */
function isOperatorAiUrl(url: string) {
  const operator = process.env.AI_CUSTOM_URL?.trim();
  return Boolean(operator) && url.trim() === operator;
}

export class CustomProvider implements SchedulerAI {
  name = "Custom";

  constructor(private config: SchedulerAIConfig) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.config.customUrl) {
      throw new Error("Custom AI endpoint is not configured");
    }

    const base = this.config.customUrl.replace(/\/$/, "");
    const url = `${base}${path}`;
    const init = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
    };
    let response: Response;
    if (isOperatorAiUrl(this.config.customUrl)) {
      response = await fetchWithTimeout(url, init, this.config.timeoutMs);
    } else {
      try {
        response = await safeFetch(url, init, {
          timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
      } catch (error) {
        // The reason (private address, no such host, ...) stays out of the
        // message: it would tell a probe what exists on the internal network.
        if (error instanceof UnsafeFetchError) {
          throw new Error("Custom AI endpoint could not be reached");
        }
        throw error;
      }
    }

    if (!response.ok) {
      throw new Error(`Custom AI request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  suggestSchedule(input: SchedulingContext): Promise<AISuggestion> {
    return this.post<AISuggestion>("/schedule", input);
  }

  parseTasks(text: string): Promise<ParsedTask[]> {
    return this.post<ParsedTask[]>("/parse-tasks", { text });
  }

  async selectChatTool(input: AIChatRequest): Promise<AIChatToolCall | null> {
    if (!input.tools?.length) return null;
    try {
      const result = await this.post<unknown>("/chat/tool", input);
      const record = asRecord(result);
      if (!record || typeof record.name !== "string") return null;
      return {
        name: record.name,
        arguments: parseToolArguments(record.arguments),
      };
    } catch {
      return null;
    }
  }

  async *streamChat(input: AIChatRequest): AsyncGenerator<string> {
    const result = await this.post<unknown>("/chat", input);
    const record = asRecord(result);
    const text =
      (typeof record?.message === "string" && record.message) ||
      (typeof record?.text === "string" && record.text) ||
      "Custom AI completed without returning text.";
    yield text;
  }
}

export function createSchedulerAI(config: SchedulerAIConfig): SchedulerAI {
  switch (config.provider) {
    case "ANTHROPIC":
      return new AnthropicProvider(config);
    case "OPENAI":
      return new OpenAIProvider(config, "OpenAI", "gpt-4o");
    case "GROK":
      return new OpenAIProvider(
        { ...config, baseUrl: config.baseUrl || "https://api.x.ai/v1" },
        "Grok",
        "grok-2-latest"
      );
    case "GLM":
      return new OpenAIProvider(
        {
          ...config,
          baseUrl: config.baseUrl || "https://api.z.ai/api/paas/v4",
        },
        "GLM",
        "glm-4.5"
      );
    case "CUSTOM":
      return new CustomProvider(config);
    case "NONE":
    default:
      return new NoneProvider();
  }
}
