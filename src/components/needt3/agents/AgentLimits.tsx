"use client";

import { useState } from "react";

import { AgBtn } from "./AgParts";

/** What the owner sets per agent; a blank number means no limit. */
export interface AgentLimitsValue {
  maxInProgress: number | null;
  maxClaimsPerDay: number | null;
  inboxLimit: number | null;
  acceptsLarge: boolean;
}

type Body = Partial<Omit<AgentLimitsValue, "acceptsLarge">> & {
  acceptsLarge?: boolean;
};

const FIELDS = [
  { key: "maxInProgress", label: "Items at once", max: 100 },
  { key: "maxClaimsPerDay", label: "Claims per day (UTC)", max: 1000 },
  { key: "inboxLimit", label: "Items shown in inbox", max: 25 },
] as const;

function toNumber(text: string): number | null {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The owner's workload limits for one agent. Agents cannot change these. */
export function AgentLimits({
  limits,
  onSave,
}: {
  limits: AgentLimitsValue | null;
  onSave: (body: Body | null) => void;
}) {
  const [text, setText] = useState<Record<string, string>>({
    maxInProgress: String(limits?.maxInProgress ?? ""),
    maxClaimsPerDay: String(limits?.maxClaimsPerDay ?? ""),
    inboxLimit: String(limits?.inboxLimit ?? ""),
  });
  const [acceptsLarge, setAcceptsLarge] = useState(
    limits?.acceptsLarge ?? true
  );

  const save = () =>
    onSave({
      maxInProgress: toNumber(text.maxInProgress),
      maxClaimsPerDay: toNumber(text.maxClaimsPerDay),
      inboxLimit: toNumber(text.inboxLimit),
      acceptsLarge,
    });

  return (
    <div className="ag-form" data-ag-limits="">
      {FIELDS.map((field) => (
        <input
          key={field.key}
          className="nt-input"
          type="number"
          min={1}
          max={field.max}
          inputMode="numeric"
          aria-label={field.label}
          placeholder={`${field.label}: no limit`}
          value={text[field.key]}
          onChange={(e) => setText({ ...text, [field.key]: e.target.value })}
        />
      ))}
      <label className="ag-meta">
        <input
          type="checkbox"
          checked={acceptsLarge}
          onChange={(e) => setAcceptsLarge(e.target.checked)}
        />{" "}
        Accepts large items
      </label>
      <AgBtn onClick={save}>Save limits</AgBtn>
      <AgBtn tone="text" onClick={() => onSave(null)}>
        Remove limits
      </AgBtn>
    </div>
  );
}

/** One quiet line for the agent row. */
export function limitsLine(limits: AgentLimitsValue | null) {
  if (!limits) return "";
  const parts = [
    limits.maxInProgress ? `${limits.maxInProgress} at once` : "",
    limits.maxClaimsPerDay ? `${limits.maxClaimsPerDay} per day` : "",
    limits.inboxLimit ? `inbox ${limits.inboxLimit}` : "",
    limits.acceptsLarge ? "" : "no large items",
  ].filter(Boolean);
  return parts.length ? ` Limits: ${parts.join(", ")}.` : "";
}
