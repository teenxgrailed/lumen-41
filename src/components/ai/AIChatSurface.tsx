"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
  CalendarCheck,
  LoaderCircle,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Search,
  Send,
  X,
} from "lucide-react";

import { APP_NAME } from "@/lib/app-config";
import { newDate } from "@/lib/date-utils";
import {
  NEEDT_AI_ACTION_EVENT,
  NEEDT_SCHEDULE_CHANGED_EVENT,
} from "@/lib/needt-events";
import { cn } from "@/lib/utils";

import { useIsMobile } from "@/hooks/use-is-mobile";

interface AiMessage {
  id: string;
  role: string;
  content: string;
  requiresConfirm?: boolean;
}

interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  messages: AiMessage[];
}

interface AISettingsResponse {
  provider: string;
  hasApiKey: boolean;
  hostedAvailable?: boolean;
  usage?: {
    plan: "FREE" | "PRO" | "LIFETIME";
    allowed: boolean;
    slowMode: boolean;
    exhausted: boolean;
    mode: "normal" | "slow" | "blocked";
  };
}

interface RescheduleChange {
  taskId: string;
  title: string;
  fromStart: string | null;
  toStart: string | null;
}

interface ReschedulePreview {
  changes: RescheduleChange[];
  previewToken: string;
}

interface AIChatSurfaceProps {
  compact?: boolean;
}

const prompts = [
  "What should I work on next?",
  "Plan my week",
  "Reschedule my day",
  "Summarize my day",
];

//todo: pre-v3 chat. /chat now redirects to Today's Ask panel; the last user
// is AIChatOverlay in the legacy AppShell. Delete both with that shell.
export function AIChatSurface({ compact = false }: AIChatSurfaceProps) {
  const [settings, setSettings] = useState<AISettingsResponse | null>(null);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [showBriefing, setShowBriefing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(!compact);
  const isMobile = useIsMobile(768);

  const active = conversations.find((item) => item.id === activeId) || null;
  const messages = active?.messages || [];
  const canChat = Boolean(
    settings?.hasApiKey ||
      (settings?.hostedAvailable && settings.usage?.allowed)
  );

  useEffect(() => {
    fetch("/api/ai-settings")
      .then((response) => response.json())
      .then(setSettings)
      .catch(() =>
        setSettings({
          provider: "NONE",
          hasApiKey: false,
          hostedAvailable: false,
        })
      );
    fetch("/api/ai/conversations")
      .then((response) => response.json())
      .then((data) => {
        setConversations(data.conversations || []);
        setActiveId(data.conversations?.[0]?.id || null);
      })
      .catch(() => undefined);
    const today = newDate().toISOString().slice(0, 10);
    setShowBriefing(localStorage.getItem("lastBriefingAt") !== today);
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt) setInput(prompt);
  }, []);

  useEffect(() => {
    if (isMobile) setHistoryOpen(false);
  }, [isMobile]);

  const grouped = useMemo(() => {
    return conversations.reduce<Record<string, AiConversation[]>>(
      (acc, item) => {
        const day = newDate(item.createdAt).toLocaleDateString();
        acc[day] = acc[day] || [];
        acc[day].push(item);
        return acc;
      },
      {}
    );
  }, [conversations]);

  async function newChat() {
    const response = await fetch("/api/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New chat" }),
    });
    if (!response.ok) return;
    const data = await response.json();
    setConversations((current) => [data.conversation, ...current]);
    setActiveId(data.conversation.id);
  }

  async function send(message = input, confirmed = false) {
    const trimmed = message.trim();
    if (!trimmed || !canChat || streaming) return;
    setInput("");
    setPendingConfirm(null);
    setStreaming(true);

    const tempUser: AiMessage = {
      id: `user-${newDate().getTime()}`,
      role: "user",
      content: trimmed,
    };
    const tempAssistant: AiMessage = {
      id: `assistant-${newDate().getTime()}`,
      role: "assistant",
      content: "",
    };
    setConversations((current) => {
      const targetId = activeId || "pending";
      if (!activeId) {
        return [
          {
            id: targetId,
            title: trimmed.slice(0, 42),
            createdAt: newDate().toISOString(),
            messages: [tempUser, tempAssistant],
          },
          ...current,
        ];
      }
      return current.map((item) =>
        item.id === activeId
          ? { ...item, messages: [...item.messages, tempUser, tempAssistant] }
          : item
      );
    });
    if (!activeId) setActiveId("pending");

    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: activeId === "pending" ? undefined : activeId,
        message: trimmed,
        confirmed,
      }),
    });

    if (!response.ok || !response.body) {
      let errorMessage = "I could not reach the AI provider. Try again.";
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) errorMessage = payload.error;
      } catch {
        // Keep the stable fallback when the response is not JSON.
      }
      const targetId = activeId || "pending";
      setConversations((current) =>
        current.map((item) =>
          item.id === "pending" || item.id === targetId
            ? {
                ...item,
                messages: item.messages.map((msg) =>
                  msg.id === tempAssistant.id
                    ? { ...msg, content: errorMessage }
                    : msg
                ),
              }
            : item
        )
      );
      setStreaming(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
    let conversationId = activeId;
    let requiresConfirm = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as {
          type: "meta" | "token";
          value?: string;
          conversationId?: string;
          requiresConfirm?: boolean;
          toolName?: string | null;
          toolPayload?: unknown;
          notice?: string;
        };
        if (event.type === "meta") {
          conversationId = event.conversationId || conversationId;
          requiresConfirm = Boolean(event.requiresConfirm);
          if (event.toolName === "auto_schedule" && event.toolPayload) {
            setPreview(event.toolPayload as ReschedulePreview);
          }
          if (event.toolName && event.toolName !== "confirmation_required") {
            window.dispatchEvent(
              new CustomEvent(NEEDT_AI_ACTION_EVENT, {
                detail: { label: event.toolName.replace(/_/g, " ") },
              })
            );
          }
          if (conversationId && activeId === "pending")
            setActiveId(conversationId);
          if (event.notice) {
            setSettings((current) =>
              current?.usage
                ? {
                    ...current,
                    usage: {
                      ...current.usage,
                      allowed: true,
                      slowMode: true,
                      exhausted: false,
                      mode: "slow",
                    },
                  }
                : current
            );
          }
        } else {
          assistantText += event.value || "";
          const targetId = conversationId || activeId || "pending";
          setConversations((current) =>
            current.map((item) =>
              item.id === "pending" || item.id === targetId
                ? {
                    ...item,
                    id: targetId,
                    messages: item.messages.map((msg) =>
                      msg.id === tempAssistant.id
                        ? { ...msg, content: assistantText }
                        : msg
                    ),
                  }
                : item
            )
          );
        }
      }
    }
    if (requiresConfirm) setPendingConfirm(trimmed);
    fetch("/api/ai-settings")
      .then((settingsResponse) => settingsResponse.json())
      .then(setSettings)
      .catch(() => undefined);
    setStreaming(false);
  }

  async function applyPreview() {
    if (!preview) return;
    const response = await fetch("/api/tasks/reschedule-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply", token: preview.previewToken }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { undoToken: string };
    setUndoToken(data.undoToken);
    setPreview(null);
    window.dispatchEvent(new CustomEvent(NEEDT_SCHEDULE_CHANGED_EVENT));
  }

  async function undoPreview() {
    if (!undoToken) return;
    const response = await fetch("/api/tasks/reschedule-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undo", token: undoToken }),
    });
    if (!response.ok) return;
    setUndoToken(null);
    window.dispatchEvent(new CustomEvent(NEEDT_SCHEDULE_CHANGED_EVENT));
  }

  function runDailyBriefing() {
    localStorage.setItem(
      "lastBriefingAt",
      newDate().toISOString().slice(0, 10)
    );
    setShowBriefing(false);
    void send(
      "Plan my day. Review today's schedule, deadlines, workload, and focus capacity. Give me a concise prioritized briefing. Do not change anything without asking."
    );
  }

  return (
    <div className="needt-page-depth relative flex h-full min-h-0 text-[var(--text-primary)]">
      {historyOpen && isMobile && (
        <button
          type="button"
          aria-label="Close chat history"
          className="needt-scrim absolute inset-0 z-10"
          onClick={() => setHistoryOpen(false)}
        />
      )}
      {historyOpen && (
        <aside
          className={cn(
            "needt-panel-depth w-[260px] flex-none border-r border-[var(--border-subtle)] p-2",
            isMobile &&
              "absolute inset-y-0 left-0 z-20 w-[min(86vw,320px)] shadow-xl"
          )}
        >
          {isMobile && (
            <div className="mb-2 flex min-h-11 items-center justify-between px-1 text-sm font-medium">
              Chat history
              <button
                type="button"
                aria-label="Close chat history"
                className="grid h-11 w-11 place-items-center rounded-md text-[var(--text-secondary)] active:bg-[var(--surface-hover)]"
                onClick={() => setHistoryOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="needt-raised-depth mb-2 flex min-h-11 items-center gap-2 rounded-md border border-[var(--border-control)] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] sm:min-h-9">
            <Search className="h-4 w-4" strokeWidth={1.75} />
            Search chats...
          </div>
          <button
            type="button"
            onClick={newChat}
            className="mb-4 flex min-h-11 w-full items-center gap-2 rounded-md border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] px-3 py-2 text-[13px] font-medium text-[var(--button-primary-fg)] shadow-[var(--button-primary-shadow)] sm:min-h-9"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day} className="mb-3">
              <div className="px-2 text-[11px] uppercase text-[var(--text-muted)]">
                {day}
              </div>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  className={cn(
                    "mt-1 min-h-11 w-full truncate rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-[var(--surface-hover)] sm:min-h-9",
                    item.id === activeId && "bg-[var(--surface-hover)]"
                  )}
                >
                  {item.title}
                </button>
              ))}
            </div>
          ))}
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center border-b border-[var(--border-subtle)] px-3 sm:min-h-11">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-label={historyOpen ? "Hide chat history" : "Show chat history"}
            className="grid h-11 w-11 place-items-center rounded-md text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] sm:h-8 sm:w-8"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <div className="ml-2 text-sm font-medium">AI Chat</div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:p-6">
          {!messages.length ? (
            <div className="mx-auto flex h-full max-w-[760px] flex-col justify-center text-center">
              <h1 className="text-2xl font-medium">{APP_NAME} is ready.</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                What can I help you get done?
              </p>
              {showBriefing && canChat && (
                <button
                  type="button"
                  onClick={runDailyBriefing}
                  className="mx-auto mt-5 flex w-full max-w-md items-center gap-3 rounded-md border border-[var(--border-control)] bg-[var(--surface-raised)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <CalendarCheck className="h-5 w-5 text-[var(--color-accent)]" />
                  <span>
                    <span className="block text-sm font-medium">
                      Plan my day
                    </span>
                    <span className="block text-xs text-[var(--text-secondary)]">
                      Deadlines, workload, schedule, and a clear first step.
                    </span>
                  </span>
                </button>
              )}
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="needt-panel-depth rounded-md border border-[var(--border-subtle)] px-4 py-3 text-left text-sm transition-colors duration-150 hover:bg-[var(--surface-hover)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[760px] space-y-5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "text-sm leading-6",
                    message.role === "user"
                      ? "ml-auto max-w-[88%] rounded-lg bg-[var(--surface-hover)] px-3 py-2"
                      : "mr-auto max-w-[94%] px-1 py-1 text-[var(--text-secondary)]"
                  )}
                >
                  {message.content}
                </div>
              ))}
              {streaming && (
                <div
                  role="status"
                  className="flex items-center gap-2 px-1 text-sm text-[var(--text-muted)]"
                >
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Thinking…
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {settings?.usage?.slowMode && !settings.hasApiKey && (
            <div className="needt-panel-depth mx-auto mb-2 max-w-[760px] rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              AI is busy, so replies may take a little longer. Add your own key
              for full speed.
            </div>
          )}
          {!canChat && (
            <div className="needt-panel-depth mx-auto mb-2 max-w-[760px] rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              {settings?.usage?.plan === "FREE" ? (
                "The AI agent is available on Needt Pro and Lifetime."
              ) : settings?.usage?.exhausted ? (
                <Link
                  href="/settings#ai"
                  className="text-[var(--color-accent)]"
                >
                  AI is resting until the 1st. Add your own key to keep going.
                </Link>
              ) : (
                <>
                  Hosted AI is not configured.{" "}
                  <Link
                    href="/settings#ai"
                    className="text-[var(--color-accent)]"
                  >
                    Open Settings → AI
                  </Link>
                </>
              )}
            </div>
          )}
          {preview && (
            <div className="mx-auto mb-2 max-w-[760px] rounded-md border border-[var(--border-control)] bg-[var(--surface-raised)] p-3 text-sm">
              <div className="font-medium">Schedule preview</div>
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-[var(--text-secondary)]">
                {preview.changes.length ? (
                  preview.changes.map((change) => (
                    <div key={change.taskId}>
                      {change.title}:{" "}
                      {change.fromStart
                        ? newDate(change.fromStart).toLocaleString()
                        : "unscheduled"}{" "}
                      →{" "}
                      {change.toStart
                        ? newDate(change.toStart).toLocaleString()
                        : "unscheduled"}
                    </div>
                  ))
                ) : (
                  <div>No changes needed.</div>
                )}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-md border border-[var(--border-control)] px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyPreview}
                  disabled={!preview.changes.length}
                  className="rounded-md border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] px-3 py-1.5 text-xs text-[var(--button-primary-fg)] shadow-[var(--button-primary-shadow)] disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
          {undoToken && (
            <div className="mx-auto mb-2 flex max-w-[760px] items-center justify-between rounded-md border border-[var(--border-control)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
              <span>Schedule updated.</span>
              <button
                type="button"
                onClick={undoPreview}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo
              </button>
            </div>
          )}
          {pendingConfirm && (
            <div className="mx-auto mb-2 flex max-w-[760px] items-center justify-between rounded-md border border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3 py-2 text-sm">
              <span>Confirm this planner-changing action?</span>
              <button
                type="button"
                onClick={() => send(pendingConfirm, true)}
                className="rounded-md border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] px-3 py-1.5 text-xs text-[var(--button-primary-fg)] shadow-[var(--button-primary-shadow)]"
              >
                Confirm
              </button>
            </div>
          )}
          <form
            className="needt-panel-depth mx-auto flex min-h-14 max-w-[760px] items-center gap-2 rounded-[10px] border border-[var(--border-control)] p-2 transition-colors duration-150 focus-within:border-[var(--text-muted)] sm:min-h-12"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              disabled={!canChat || streaming}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[var(--text-muted)]"
              placeholder="Ask anything about your tasks and calendar..."
            />
            <button
              type="submit"
              disabled={!canChat || streaming || !input.trim()}
              aria-label="Send message"
              className="grid h-10 w-10 place-items-center rounded-md border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] text-[var(--button-primary-fg)] shadow-[var(--button-primary-shadow)] disabled:opacity-40 sm:h-8 sm:w-8"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
