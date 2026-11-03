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

/** Blank is no limit; anything else must be a whole number from 1 to max. */
function parseField(
  text: string,
  max: number
): { value: number | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { value: null, error: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    return { value: null, error: `Enter a whole number from 1 to ${max}.` };
  }
  return { value: n, error: null };
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

  const parsed = {
    maxInProgress: parseField(text.maxInProgress, FIELDS[0].max),
    maxClaimsPerDay: parseField(text.maxClaimsPerDay, FIELDS[1].max),
    inboxLimit: parseField(text.inboxLimit, FIELDS[2].max),
  };
  const invalid = Object.values(parsed).some((p) => p.error !== null);

  const save = () => {
    if (invalid) return;
    onSave({
      maxInProgress: parsed.maxInProgress.value,
      maxClaimsPerDay: parsed.maxClaimsPerDay.value,
      inboxLimit: parsed.inboxLimit.value,
      acceptsLarge,
    });
  };

  return (
    <div className="ag-form" data-ag-limits="">
      {FIELDS.map((field) => {
        const error = parsed[field.key].error;
        return (
          <div key={field.key}>
            <input
              className="nt-input"
              type="number"
              min={1}
              max={field.max}
              inputMode="numeric"
              aria-label={field.label}
              aria-invalid={error ? true : undefined}
              placeholder={`${field.label}: no limit`}
              value={text[field.key]}
              onChange={(e) =>
                setText({ ...text, [field.key]: e.target.value })
              }
            />
            {error ? (
              <div className="ag-meta" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        );
      })}
      <label className="ag-meta">
        <input
          type="checkbox"
          checked={acceptsLarge}
          onChange={(e) => setAcceptsLarge(e.target.checked)}
        />{" "}
        Accepts large items
      </label>
      <AgBtn onClick={save} disabled={invalid}>
        Save limits
      </AgBtn>
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
