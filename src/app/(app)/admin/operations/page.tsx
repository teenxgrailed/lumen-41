"use client";

import { useEffect, useState } from "react";

import {
  LuActivity,
  LuCircleCheck,
  LuClock3,
  LuTriangleAlert,
} from "react-icons/lu";

import { AdminNote, AdminPage } from "@/components/admin/kit";

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
    return { label: "Not configured", tone: "var(--text-tertiary)" };
  if (entry.healthy === false)
    return { label: "Down", tone: "var(--destructive)" };
  if (entry.healthy === true) return { label: "Alive", tone: "var(--success)" };
  return { label: "Configured", tone: "var(--success)" };
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
    <section className="admin-card">
      <div className="flex items-center justify-between gap-4">
        <h2 className="admin-section-title">Services</h2>
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          disabled={sending}
          onClick={() => void sendTestEvent()}
        >
          {sending ? "Sending…" : "Send test event"}
        </button>
      </div>
      {sentryResult && <p className="admin-note mt-2">{sentryResult}</p>}
      <div className="admin-rows" role="list">
        {services.map((entry) => {
          const state = serviceState(entry);
          return (
            <div key={entry.service} className="admin-row" role="listitem">
              <div className="admin-row-text">
                <span className="admin-row-title">{entry.service}</span>
                {entry.detail && <p className="admin-meta">{entry.detail}</p>}
              </div>
              <span className="admin-row-control admin-meta">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: state.tone }}
                />
                {state.label}
              </span>
            </div>
          );
        })}
      </div>
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
    <AdminPage
      title="Operations"
      lead="Queues, cron jobs and service readiness. Refreshes every 15 seconds."
      actions={
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
      }
    >
      <div className="admin-stack">
        {error && (
          <div className="admin-card">
            <AdminNote tone="danger">{error}</AdminNote>
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
                  <article key={queue.name} className="admin-card">
                    <div className="flex items-center justify-between">
                      <h2 className="admin-section-title">{queue.name}</h2>
                      {warning ? (
                        <LuTriangleAlert
                          size={16}
                          aria-hidden
                          style={{ color: "var(--text-tertiary)" }}
                        />
                      ) : (
                        <LuCircleCheck
                          size={16}
                          aria-hidden
                          style={{ color: "var(--success)" }}
                        />
                      )}
                    </div>
                    <dl
                      className="admin-facts mt-4"
                      style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
                    >
                      <div className="admin-fact">
                        <dt className="admin-meta">Waiting</dt>
                        <dd className="admin-fact-value">{queue.waiting}</dd>
                      </div>
                      <div className="admin-fact">
                        <dt className="admin-meta">Active</dt>
                        <dd className="admin-fact-value">{queue.active}</dd>
                      </div>
                      <div className="admin-fact">
                        <dt className="admin-meta">Failed</dt>
                        <dd className="admin-fact-value">{queue.failed}</dd>
                      </div>
                    </dl>
                    <p className="admin-meta mt-3 flex items-center gap-2">
                      <LuClock3 size={14} aria-hidden />
                      Oldest wait {Math.round(queue.oldestWaitingAgeMs / 1000)}s
                    </p>
                  </article>
                );
              })}
            </section>
            <section className="admin-card">
              <h2 className="admin-section-title flex items-center gap-2">
                <LuActivity size={16} aria-hidden /> Cron health
              </h2>
              <div className="admin-rows">
                {snapshot.cronStates.map((cron) => (
                  <div key={cron.id} className="admin-row">
                    <span className="admin-row-title">{cron.id}</span>
                    <span className="admin-meta text-right">
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
    </AdminPage>
  );
}
