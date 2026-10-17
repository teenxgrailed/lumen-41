import {
  CalendarBusyBlock,
  EnergyProfile,
  SchedulableTask,
  ScheduleResult,
  SchedulingEnergyLevel,
  SchedulingPreferences,
  SchedulingTaskPriority,
} from "@/services/scheduling/engine";
import { CalibrationContext } from "@/services/time-tracking/calibration";

export type AIProviderName =
  | "NONE"
  | "ANTHROPIC"
  | "OPENAI"
  | "GROK"
  | "GLM"
  | "CUSTOM";

export interface SchedulingContext {
  tasks: SchedulableTask[];
  busyBlocks: CalendarBusyBlock[];
  energyProfile: EnergyProfile;
  prefs: SchedulingPreferences;
  now: string;
  deterministicResult?: ScheduleResult;
  calibration?: CalibrationContext;
}

export interface AIScheduleMove {
  taskId: string;
  fromStart?: string | null;
  fromEnd?: string | null;
  toStart: string;
  toEnd: string;
  reason: string;
}

export interface AISuggestion {
  summary: string;
  moves: AIScheduleMove[];
  reorderedTaskIds?: string[];
  energyTags?: Array<{
    taskId: string;
    energyRequired: SchedulingEnergyLevel;
    reason: string;
  }>;
  estimateAdjustments?: Array<{
    taskId: string;
    estimatedMinutes: number;
    reason: string;
  }>;
  warnings?: string[];
}

export interface ParsedTask {
  title: string;
  description?: string;
  estimatedMinutes?: number;
  minChunkMinutes?: number;
  maxChunkMinutes?: number;
  deadline?: string;
  priority?: SchedulingTaskPriority;
  energyRequired?: SchedulingEnergyLevel;
  contextTag?: string;
  /** The very first small step; the title is the closing step. */
  entry?: string;
  /** Short steps in the order they are done. */
  subtasks?: string[];
}

export type AIChatRole = "system" | "user" | "assistant";

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export interface AIChatToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIChatToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIChatRequest {
  systemPrompt: string;
  messages: AIChatMessage[];
  tools?: AIChatToolDefinition[];
}

/** One tool call the model made, as the next request must echo it. */
export interface AgentToolCallRef {
  id: string;
  name: string;
  /** The raw JSON string the model produced. */
  arguments: string;
}

/** The conversation inside one agent turn, tool results included. */
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AgentToolCallRef[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface AgentTurnRequest {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AIChatToolDefinition[];
}

/** What a streamed model turn produces: words as they come, then tool calls. */
export type AgentTurnEvent =
  | { type: "text"; value: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      rawArguments: string;
    };

export interface SchedulerAI {
  name: string;
  suggestSchedule(input: SchedulingContext): Promise<AISuggestion>;
  parseTasks(text: string): Promise<ParsedTask[]>;
  selectChatTool?(input: AIChatRequest): Promise<AIChatToolCall | null>;
  streamChat?(input: AIChatRequest): AsyncGenerator<string>;
  /**
   * One streamed model turn with tools. Providers that implement it run the
   * multi-step agent; the rest keep the single-tool path.
   */
  streamTurn?(input: AgentTurnRequest): AsyncGenerator<AgentTurnEvent>;
}

export interface SchedulerAIConfig {
  provider: AIProviderName;
  apiKey?: string | null;
  customUrl?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  timeoutMs?: number;
  soulPreset?: "business" | "coach";
  onUsage?: (usage: AIProviderUsage) => void | Promise<void>;
  maxTokens?: number;
  /**
   * Extra fields merged into an OpenAI-compatible request body. Used for
   * gateway-specific options such as OpenRouter provider routing; explicit
   * fields always win over anything passed here.
   */
  extraBody?: Record<string, unknown>;
}
