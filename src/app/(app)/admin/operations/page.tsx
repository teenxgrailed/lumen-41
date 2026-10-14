"use client";

import { useEffect, useState } from "react";

import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface OperationsSnapshot {
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    failed: number;
    oldestWaitingAgeMs: number;
  }>;
  cronStates: Array<{
    id: string;
    lastStartedAt: string | null;
    lastSucceededAt: string | null;
    lastError: string | null;
  }>;
  lastSuccessfulBySource: Array<{
    id: string;
    source: string;
    finishedAt: string | null;
  }>;
  lastError: {
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  services?: ServiceReadiness[];
}

interface ServiceReadiness {
  service: string;
  configured: boolean;
  healthy?: boolean;
  detail?: string;
}

function serviceState(entry: ServiceReadiness) {
  if (!entry.configured)
    return { label: "Not configured", tone: "bg-amber-500" };
  if (entry.healthy === false) return { label: "Down", tone: "bg-red-500" };
  if (entry.healthy === true) return { label: "Alive", tone: "bg-emerald-500" };
  return { label: "Configured", tone: "bg-emerald-500" };
}

function ServicesSection({ services }: { services: ServiceReadiness[] }) {
  const [sentryResult, setSentryResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const sendTestEvent = async () => {
    setSending(true);
    try {
      const response = await fetch("/api/admin/sentry-check", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        delivered?: boolean;
        eventId?: string;
        reason?: string;
      } | null;
      if (body?.delivered) {
        setSentryResult(`Delivered. Event ${body.eventId ?? "unknown"}.`);
      } else {
        setSentryResult(body?.reason ?? `Not delivered (${response.status}).`);
      }
    } catch {
      setSentryResult("Could not reach the server.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="needt-panel-depth rounded-xl border border-[var(--border-subtle)] p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[13px] font-medium">Services</h2>
        <Button
          variant="outline"
          size="sm"
          className="text-[12px]"
          disabled={sending}
          onClick={() => void sendTestEvent()}
        >
          {sending ? "Sending…" : "Send test event"}
        </Button>
      </div>
      {sentryResult && (
        <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
          {sentryResult}
        </p>
      )}
      <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
        {services.map((entry) => {
          const state = serviceState(entry);
          return (
            <li
              key={entry.service}
              className="flex items-start justify-between gap-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[13px]">{entry.service}</p>
                {entry.detail && (
                  <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                    {entry.detail}
                  </p>
                )}
              </div>
              <span className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${state.tone}`}
                />
                {state.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function OperationsPage() {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/admin/operations", {
      cache: "no-store",
    });
    if (!response.ok) {
      setError(
        response.status === 403
          ? "Admin access required."
          : "Could not load operations."
      );
      return;
    }
    setSnapshot((await response.json()) as OperationsSnapshot);
    setError(null);
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="needt-page-depth min-h-dvh px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Admin
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Operations</h1>
          </div>
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </header>
        {error && (
          <div className="needt-panel-depth rounded-xl border border-[var(--border-subtle)] p-4 text-sm">
            {error}
          </div>
        )}
        {snapshot && (
          <>
            {snapshot.services && (
              <ServicesSection services={snapshot.services} />
            )}
            <section className="grid gap-3 md:grid-cols-2">
              {snapshot.queues.map((queue) => {
                const warning =
                  queue.waiting > 100 || queue.oldestWaitingAgeMs > 120_000;
                return (
                  <article
                    key={queue.name}
                    className="needt-panel-depth rounded-xl border border-[var(--border-subtle)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-medium">{queue.name}</h2>
                      {warning ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt className="text-[var(--text-muted)]">Waiting</dt>
                        <dd className="mt-1 text-lg">{queue.waiting}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--text-muted)]">Active</dt>
                        <dd className="mt-1 text-lg">{queue.active}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--text-muted)]">Failed</dt>
                        <dd className="mt-1 text-lg">{queue.failed}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Clock3 className="h-3.5 w-3.5" />
                      Oldest wait {Math.round(queue.oldestWaitingAgeMs / 1000)}s
                    </p>
                  </article>
                );
              })}
            </section>
            <section className="needt-panel-depth rounded-xl border border-[var(--border-subtle)] p-4">
              <h2 className="flex items-center gap-2 font-medium">
                <Activity className="h-4 w-4" /> Cron health
              </h2>
              <div className="mt-4 divide-y divide-[var(--border-subtle)]">
                {snapshot.cronStates.map((cron) => (
                  <div
                    key={cron.id}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span>{cron.id}</span>
                    <span className="text-right text-[var(--text-secondary)]">
                      {cron.lastSucceededAt
                        ? new Date(cron.lastSucceededAt).toLocaleString()
                        : "Never succeeded"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
