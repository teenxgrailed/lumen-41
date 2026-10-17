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

export class CustomProvider implements SchedulerAI {
  name = "Custom";

  constructor(private config: SchedulerAIConfig) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.config.customUrl) {
      throw new Error("Custom AI endpoint is not configured");
    }

    const base = this.config.customUrl.replace(/\/$/, "");
    const response = await fetchWithTimeout(
      `${base}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify(body),
      },
      this.config.timeoutMs
    );

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
