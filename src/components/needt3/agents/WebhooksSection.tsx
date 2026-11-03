"use client";

import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { formatDateToLocal } from "@/lib/date-utils";
import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { notify } from "@/lib/notifications";

import { ProBadge } from "../paywall/Pro";
import { openPaywall } from "../paywall/store";
import { AgBtn, AgRow, AgSection, type AgTone } from "./AgParts";

const FEATURE = "Webhooks";

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  consecutiveFailures: number;
  disabledReason: string | null;
  lastDeliveryAt: string | null;
}
interface WebhooksAnswer {
  allowed: boolean;
  events: string[];
  webhooks: WebhookRow[];
}
interface DeliveryRow {
  id: string;
  event: string;
  status: string;
  attempts: number;
  lastError: string | null;
  lastStatus: number | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

const EVENT_LABEL: Record<string, string> = {
  "item.created": "Item created",
  "item.claimed": "Item claimed",
  "item.completed": "Item completed",
  "item.escalated": "Item escalated",
  "message.created": "Message created",
};
const DEFAULT_EVENTS = Object.keys(EVENT_LABEL);

const deliveryTone = (status: string): AgTone =>
  status === "success" ? "success" : status === "failed" ? "danger" : "muted";

function Deliveries({ id }: { id: string }) {
  const deliveries = useQuery({
    queryKey: ["agent-hub", "webhook-deliveries", id],
    queryFn: () =>
      fetchJson<{ deliveries: DeliveryRow[] }>(
        `/api/agent-hub/webhooks/${id}/deliveries`
      ),
    refetchInterval: 10_000,
  });
  const rows = deliveries.data?.deliveries ?? [];
  if (rows.length === 0) {
    return <p className="ag-hint">No deliveries yet.</p>;
  }
  return (
    <div className="ag-list">
      {rows.map((d) => (
        <AgRow
          key={d.id}
          title={d.event}
          tone={deliveryTone(d.status)}
          meta={`${d.status}${d.lastStatus ? ` (${d.lastStatus})` : ""}, ${d.attempts} ${
            d.attempts === 1 ? "try" : "tries"
          }, ${formatDateToLocal(new Date(d.createdAt))}${
            d.lastError ? `. ${d.lastError}` : ""
          }`}
        />
      ))}
    </div>
  );
}

/** Owner webhooks for hub events: add, pick events, secret once, deliveries, test. */
export function WebhooksSection() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(DEFAULT_EVENTS);
  const [fresh, setFresh] = useState<{ url: string; secret: string } | null>(
    null
  );
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["agent-hub", "webhooks"],
    queryFn: () => fetchJson<WebhooksAnswer>("/api/agent-hub/webhooks"),
  });
  const allowed = query.data?.allowed ?? true;
  const webhooks = query.data?.webhooks ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["agent-hub"] });
  const run = async (task: () => Promise<unknown>, done?: string) => {
    try {
      await task();
      if (done) notify.success(done);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed");
    }
  };

  const toggle = (event: string) =>
    setEvents((current) =>
      current.includes(event)
        ? current.filter((e) => e !== event)
        : [...current, event]
    );

  const add = () =>
    run(async () => {
      const made = await sendJson<{
        webhook: WebhookRow;
        secret: string;
      }>("/api/agent-hub/webhooks", "POST", { url: url.trim(), events });
      setFresh({ url: made.webhook.url, secret: made.secret });
      setUrl("");
    });

  return (
    <AgSection
      title="Webhooks"
      hint={
        allowed ? (
          "Needt posts hub events to your URL, signed with X-Needt-Signature, so n8n, Zapier or your own script does not have to poll."
        ) : (
          <>
            Send hub events to n8n, Zapier or your own script.{" "}
            <ProBadge size="sm" locked feature={FEATURE} />
          </>
        )
      }
    >
      {fresh ? (
        <div className="ag-token" data-ag-token="">
          <span className="ag-title">{`Signing secret for ${fresh.url}`}</span>
          <code>{fresh.secret}</code>
          <span className="ag-token-row">
            <span className="ag-meta">Copy it now. It is not shown again.</span>
            <AgBtn onClick={() => setFresh(null)}>Done</AgBtn>
          </span>
        </div>
      ) : null}
      {webhooks.map((hook) => (
        <AgRow
          key={hook.id}
          title={hook.url}
          tone={hook.active ? "success" : "danger"}
          meta={`${hook.events.join(", ")}.${
            hook.active
              ? hook.consecutiveFailures > 0
                ? ` ${hook.consecutiveFailures} failed in a row.`
                : ""
              : ` Off. ${hook.disabledReason ?? ""}`
          }`}
          expanded={open === hook.id}
          onToggle={() => setOpen(open === hook.id ? null : hook.id)}
          detail={open === hook.id ? <Deliveries id={hook.id} /> : undefined}
          actions={
            <>
              <AgBtn
                disabled={!allowed}
                onClick={() =>
                  run(
                    () =>
                      sendJson(
                        `/api/agent-hub/webhooks/${hook.id}/test`,
                        "POST",
                        {}
                      ),
                    "Test event queued"
                  )
                }
              >
                Send test
              </AgBtn>
              <AgBtn
                disabled={!hook.active && !allowed}
                onClick={() =>
                  run(() =>
                    sendJson(`/api/agent-hub/webhooks/${hook.id}`, "PATCH", {
                      active: !hook.active,
                    })
                  )
                }
              >
                {hook.active ? "Turn off" : "Turn on"}
              </AgBtn>
              <AgBtn
                tone="danger"
                onClick={() =>
                  run(
                    () =>
                      sendJson(`/api/agent-hub/webhooks/${hook.id}`, "DELETE"),
                    "Webhook removed"
                  )
                }
              >
                Remove
              </AgBtn>
            </>
          }
        />
      ))}
      <div className="ag-form" role="group" aria-label="Add a webhook">
        <input
          className="nt-input"
          aria-label="Webhook URL"
          value={url}
          maxLength={500}
          placeholder="https://example.com/needt-hook"
          disabled={!allowed}
          onChange={(e) => setUrl(e.target.value)}
        />
        {allowed ? (
          <AgBtn disabled={!url.trim() || events.length === 0} onClick={add}>
            Add webhook
          </AgBtn>
        ) : (
          <AgBtn onClick={() => openPaywall(FEATURE)}>Unlock with Pro</AgBtn>
        )}
      </div>
      {allowed ? (
        <div className="ag-form" role="group" aria-label="Events">
          {DEFAULT_EVENTS.map((event) => (
            <AgBtn
              key={event}
              pressed={events.includes(event)}
              onClick={() => toggle(event)}
            >
              {EVENT_LABEL[event]}
            </AgBtn>
          ))}
        </div>
      ) : null}
    </AgSection>
  );
}
