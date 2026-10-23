import { finishAgentRun, startAgentRun } from "@/services/ops";
import type { PageActor } from "@/services/pages/page-service";
import { WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { logger } from "@/lib/logger";

import {
  getAgentToolDefinitions,
  validateAgentToolCall,
} from "../tool-catalog";
import type { AIChatToolDefinition, AgentMessage, SchedulerAI } from "../types";
import type { AgentStreamEvent } from "./events";
import { type ToolResult, executeTool } from "./legacy-tools";
import {
  type AgentActionRef,
  type AgentSource,
  type AgentToolContext,
  type AgentToolOutcome,
  SUPERSEDED_LEGACY_TOOLS,
  agentToolDefinitions,
  getAgentTool,
  modelJson,
  outcomeFromError,
} from "./tools";

const LOG_SOURCE = "ai-agent-loop";

/** Model round trips in one turn. Enough to read, act and answer. */
export const MAX_AGENT_STEPS = 6;

/**
 * Changes one turn may make. The write tools run without asking, so a page,
 * mail or event that talks the model into "fixing" everything stops here
 * instead of rewriting the planner. Each change is still undoable.
 */
export const MAX_WRITES_PER_TURN = 10;

/** Legacy catalog tools that only read (or only parse); every other one writes. */
const READ_ONLY_LEGACY_TOOLS = new Set([
  "query_schedule",
  "list_pages",
  "search_pages",
  "get_focus_stats",
  "search_mail",
  "get_message",
  "get_user_settings",
  "list_memories",
  "parse_brain_dump",
]);

/** Whether a call changes something. Unknown tools count as changes. */
export function isMutatingToolCall(
  name: string,
  args: Record<string, unknown>
) {
  const own = getAgentTool(name);
  if (own) return own.kind !== "read";
  if (READ_ONLY_LEGACY_TOOLS.has(name)) return false;
  if (name === "manage_projects" && args.action === "list") return false;
  return true;
}

export const WRITE_LIMIT_MESSAGE = `I stopped after ${MAX_WRITES_PER_TURN} changes, the most I make in one request. Each one can be undone from the action list. Ask me to continue if you want more.`;

export interface AgentSettings {
  allowParseTasks: boolean;
  allowFullAuto: boolean;
}

/** Everything the model may call: the op-backed tools plus the legacy rest. */
export function allAgentToolDefinitions(
  settings: AgentSettings
): AIChatToolDefinition[] {
  const own = agentToolDefinitions();
  const taken = new Set(own.map((tool) => tool.name));
  const legacy = getAgentToolDefinitions(settings).filter(
    (tool) => !SUPERSEDED_LEGACY_TOOLS.has(tool.name) && !taken.has(tool.name)
  );
  return [...own, ...legacy];
}

export interface PendingConfirmation {
  prompt: string;
  tool: { name: string; arguments: Record<string, unknown> };
}

export interface AgentTurnResult {
  text: string;
  actions: AgentActionRef[];
  sources: AgentSource[];
  runId: string | null;
  pending: PendingConfirmation | null;
  /** Planner data may have changed, so the screen should refetch. */
  changed: boolean;
  /** The last task a tool touched, for the cursor. */
  taskId: string | null;
  /** The turn stopped at `MAX_WRITES_PER_TURN` changes. */
  writeLimitReached: boolean;
}

interface TurnInput {
  ai: SchedulerAI;
  systemPrompt: string;
  history: AgentMessage[];
  settings: AgentSettings;
  userId: string;
  workspace: WorkspaceAccess;
  pageActor: PageActor;
  emit: (event: AgentStreamEvent) => void;
  signal?: AbortSignal;
}

function lazyRun(input: TurnInput) {
  let runId: string | null = null;
  return {
    get: async () => {
      if (!runId) {
        runId = (
          await startAgentRun({
            userId: input.userId,
            workspaceId: input.workspace.workspaceId,
            actor: "agent",
            source: "chat",
          })
        ).id;
      }
      return runId;
    },
    peek: () => runId,
  };
}

function legacyOutcome(result: ToolResult): AgentToolOutcome {
  return {
    ok: !result.requiresConfirm,
    summary: result.text,
    modelText: modelJson({ result: result.text }),
    confirm: result.requiresConfirm ? { prompt: result.text } : undefined,
    changed: false,
  };
}

/**
 * Runs one tool call: validates its arguments, refuses writes to a viewer,
 * and asks before anything destructive. Never throws for a tool's own failure;
 * the model reads the failure and answers.
 */
export async function runAgentToolCall(
  ctx: AgentToolContext,
  name: string,
  rawArguments: Record<string, unknown>,
  options: { confirmed: boolean; settings: AgentSettings }
): Promise<AgentToolOutcome> {
  const tool = getAgentTool(name);
  if (tool) {
    const parsed = tool.schema.safeParse(rawArguments);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ");
      return {
        ok: false,
        summary: "That request was not valid.",
        modelText: modelJson({
          ok: false,
          error: `Invalid arguments: ${message}`,
        }),
        changed: false,
      };
    }
    if (tool.kind !== "read" && ctx.workspace.role === WorkspaceRole.VIEWER) {
      return {
        ok: false,
        summary: "An Editor or Owner role is required.",
        modelText: modelJson({
          ok: false,
          error: "This workspace role cannot change data.",
        }),
        changed: false,
      };
    }
    try {
      return await tool.run(ctx, parsed.data, {
        confirmed: options.confirmed,
      });
    } catch (error) {
      try {
        return outcomeFromError(error);
      } catch {
        logger.error(
          "Agent tool failed",
          {
            tool: name,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
        return {
          ok: false,
          summary: "Something went wrong, and nothing was changed.",
          modelText: modelJson({ ok: false, error: "internal error" }),
          changed: false,
        };
      }
    }
  }

  // The remaining tools (focus, mail, settings, memory, projects ...).
  const known = allAgentToolDefinitions(options.settings).some(
    (definition) => definition.name === name
  );
  if (!known || !validateAgentToolCall(name, rawArguments)) {
    return {
      ok: false,
      summary: "That tool is not available.",
      modelText: modelJson({
        ok: false,
        error: `Unknown tool or arguments: ${name}`,
      }),
      changed: false,
    };
  }
  const result = await executeTool(
    ctx.ai,
    { name, arguments: rawArguments },
    ctx.userId,
    ctx.workspace,
    options.confirmed,
    ctx.pageActor
  );
  return legacyOutcome(result);
}

function tail(text: string) {
  return text.length === 0 || /\n\s*$/.test(text) ? "" : "\n\n";
}

/**
 * The agent turn: stream the model; when it calls tools, run them and give it
 * the results; repeat until it answers in words. A destructive tool stops the
 * turn and hands back a question instead of acting.
 */
export async function runAgentTurn(input: TurnInput): Promise<AgentTurnResult> {
  const { ai } = input;
  if (!ai.streamTurn) throw new Error("This provider cannot run the agent");
  const run = lazyRun(input);
  const ctx: AgentToolContext = {
    ai,
    userId: input.userId,
    workspace: input.workspace,
    pageActor: input.pageActor,
    runId: run.get,
  };
  const tools = allAgentToolDefinitions(input.settings);
  const messages: AgentMessage[] = [...input.history];
  const actions: AgentActionRef[] = [];
  const sources = new Map<string, AgentSource>();
  let text = "";
  let changed = false;
  let taskId: string | null = null;
  let pending: PendingConfirmation | null = null;
  let writes = 0;
  let writeLimitReached = false;

  try {
    for (
      let step = 0;
      step < MAX_AGENT_STEPS && !pending && !writeLimitReached;
      step += 1
    ) {
      if (input.signal?.aborted) break;
      let stepText = "";
      const calls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
        rawArguments: string;
      }> = [];
      for await (const event of ai.streamTurn({
        systemPrompt: input.systemPrompt,
        messages,
        tools: step === MAX_AGENT_STEPS - 1 ? [] : tools,
      })) {
        if (event.type === "text") {
          const prefix = stepText ? "" : tail(text);
          stepText += event.value;
          text += prefix + event.value;
          input.emit({ type: "token", value: prefix + event.value });
        } else {
          calls.push(event);
        }
      }
      if (!calls.length) break;

      messages.push({
        role: "assistant",
        content: stepText,
        toolCalls: calls.map((call) => ({
          id: call.id,
          name: call.name,
          arguments: call.rawArguments,
        })),
      });

      for (const call of calls) {
        if (isMutatingToolCall(call.name, call.arguments)) {
          if (writes >= MAX_WRITES_PER_TURN) {
            writeLimitReached = true;
            logger.warn(
              "Agent turn stopped at the write limit",
              { userId: input.userId, limit: MAX_WRITES_PER_TURN },
              LOG_SOURCE
            );
            break;
          }
          writes += 1;
        }
        const meta = getAgentTool(call.name);
        const label = meta?.progress ?? "Working";
        input.emit({
          type: "tool",
          id: call.id,
          name: call.name,
          label,
          status: "running",
        });
        const outcome = await runAgentToolCall(ctx, call.name, call.arguments, {
          confirmed: false,
          settings: input.settings,
        });
        if (outcome.confirm) {
          pending = {
            prompt: outcome.confirm.prompt,
            tool: { name: call.name, arguments: call.arguments },
          };
          input.emit({
            type: "tool",
            id: call.id,
            name: call.name,
            label: outcome.summary,
            status: "done",
          });
          break;
        }
        if (outcome.action) actions.push(outcome.action);
        for (const source of outcome.sources ?? []) {
          sources.set(`${source.type}:${source.id}`, source);
        }
        if (outcome.changed) changed = true;
        if (outcome.taskId) taskId = outcome.taskId;
        input.emit({
          type: "tool",
          id: call.id,
          name: call.name,
          label: outcome.summary,
          status: outcome.ok ? "done" : "error",
          href: outcome.action?.href,
        });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: outcome.modelText,
        });
      }
    }
  } finally {
    const id = run.peek();
    if (id) {
      try {
        await finishAgentRun(id);
      } catch (error) {
        logger.warn(
          "Could not close the agent run",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    }
  }

  if (pending) {
    const separator = tail(text);
    text += separator + pending.prompt;
    input.emit({ type: "token", value: separator + pending.prompt });
  } else if (writeLimitReached) {
    const separator = tail(text);
    text += separator + WRITE_LIMIT_MESSAGE;
    input.emit({ type: "token", value: separator + WRITE_LIMIT_MESSAGE });
  }

  return {
    text,
    actions,
    sources: [...sources.values()],
    runId: run.peek(),
    pending,
    changed,
    taskId,
    writeLimitReached,
  };
}

/**
 * The person said yes to a pending destructive call. Run exactly that call
 * and report it in one line; no model round trip is needed to say what was
 * done.
 */
export async function runConfirmedToolCall(
  input: Omit<TurnInput, "history" | "systemPrompt">,
  tool: { name: string; arguments: Record<string, unknown> }
): Promise<AgentTurnResult> {
  const run = lazyRun(input as TurnInput);
  const ctx: AgentToolContext = {
    ai: input.ai,
    userId: input.userId,
    workspace: input.workspace,
    pageActor: input.pageActor,
    runId: run.get,
  };
  input.emit({
    type: "tool",
    id: "confirmed",
    name: tool.name,
    label: getAgentTool(tool.name)?.progress ?? "Working",
    status: "running",
  });
  let outcome: AgentToolOutcome;
  try {
    outcome = await runAgentToolCall(ctx, tool.name, tool.arguments, {
      confirmed: true,
      settings: input.settings,
    });
  } finally {
    const id = run.peek();
    if (id) await finishAgentRun(id).catch(() => undefined);
  }
  input.emit({
    type: "tool",
    id: "confirmed",
    name: tool.name,
    label: outcome.summary,
    status: outcome.ok ? "done" : "error",
    href: outcome.action?.href,
  });
  input.emit({ type: "token", value: `${outcome.summary}.` });
  return {
    text: `${outcome.summary}.`,
    actions: outcome.action ? [outcome.action] : [],
    sources: outcome.sources ?? [],
    runId: run.peek(),
    pending: null,
    changed: outcome.changed,
    taskId: outcome.taskId ?? null,
    writeLimitReached: false,
  };
}
