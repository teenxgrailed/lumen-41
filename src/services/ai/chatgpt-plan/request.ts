import type {
  AIChatToolDefinition,
  AgentMessage,
  AgentTurnRequest,
} from "../types";

/**
 * The Responses request for the person's ChatGPT plan, built to the "Preview
 * behavior and limitations" page (checked 2026-11-05):
 * https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
 *
 * - `store: false` and `stream: true` on every HTTP request.
 * - `input` is an array that carries the whole history; there is no
 *   `previous_response_id`. System guidance goes in `instructions`: an item
 *   with `role: "system"` is rejected.
 * - These fields are rejected, so they are never sent: background,
 *   conversation, max_output_tokens, max_tool_calls, metadata, moderation,
 *   multi_agent, prompt, prompt_cache_retention, safety_identifier,
 *   temperature, top_logprobs, top_p, truncation, user (and
 *   previous_response_id over HTTP).
 * - Function tools are allowed when grouped in a namespace; hosted tools
 *   (image generation, file search, code interpreter, computer use, hosted
 *   MCP, tool_search) are not, and Needt sends none.
 */
export const UNSUPPORTED_RESPONSES_FIELDS = [
  "background",
  "conversation",
  "max_output_tokens",
  "max_tool_calls",
  "metadata",
  "moderation",
  "multi_agent",
  "prompt",
  "prompt_cache_retention",
  "safety_identifier",
  "temperature",
  "top_logprobs",
  "top_p",
  "truncation",
  "user",
  "previous_response_id",
] as const;

/** Tool groups the person's plan route accepts function tools in. */
export const TOOL_NAMESPACE = "needt";

type InputItem = Record<string, unknown>;

export interface ChatGptPlanRequestBody {
  model: string;
  instructions: string;
  input: InputItem[];
  store: false;
  stream: true;
  tools?: Record<string, unknown>[];
}

/** Defence in depth: drops anything the route rejects, whoever added it. */
export function stripUnsupportedFields<T extends Record<string, unknown>>(
  body: T
): T {
  const copy: Record<string, unknown> = { ...body };
  for (const field of UNSUPPORTED_RESPONSES_FIELDS) delete copy[field];
  return copy as T;
}

function toolNamespace(tools: AIChatToolDefinition[]) {
  return {
    type: "namespace",
    name: TOOL_NAMESPACE,
    description:
      "Needt: the person's tasks, calendar, pages, habits and memory.",
    tools: tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  };
}

/**
 * Agent history as Responses input items. A tool call is echoed back as a
 * `function_call` item and its result as `function_call_output`, because with
 * `store: false` the server remembers nothing between turns. A `system`
 * message (none are expected in the history) becomes a developer message.
 */
export function agentInputItems(messages: AgentMessage[]): InputItem[] {
  const items: InputItem[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: message.toolCallId,
        output: message.content,
      });
      continue;
    }
    if (message.role === "assistant") {
      if (message.content) {
        items.push({ role: "assistant", content: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        items.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          namespace: TOOL_NAMESPACE,
          arguments: call.arguments || "{}",
        });
      }
      continue;
    }
    items.push({ role: "user", content: message.content });
  }
  return items;
}

export function buildChatGptPlanRequest(input: {
  model: string;
  turn: AgentTurnRequest;
}): ChatGptPlanRequestBody {
  const body: ChatGptPlanRequestBody = {
    model: input.model,
    instructions: input.turn.systemPrompt,
    input: agentInputItems(input.turn.messages),
    store: false,
    stream: true,
  };
  if (input.turn.tools.length) {
    body.tools = [toolNamespace(input.turn.tools)];
  }
  return stripUnsupportedFields(body);
}
