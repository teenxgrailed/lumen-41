"use client";

import { BrandIcon, brandIdFor } from "../brand";

/**
 * An agent's tile: the real brand mark when we have one (Claude, ChatGPT,
 * Cursor, Gemini, Perplexity, GitHub; Codex wears OpenAI's), a calm
 * monogram otherwise (Grok, other MCP clients, a named token). Brand colour
 * stays inside its tile (owner, 05.11.26).
 */
const ALIAS: Record<string, string> = {
  codex: "openai",
  openai: "openai",
  gpt: "chatgpt",
  googlegemini: "gemini",
};

export function agentBrandId(name: string | null | undefined) {
  if (!name) return null;
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [word, id] of Object.entries(ALIAS))
    if (key.includes(word)) return id;
  for (const id of [
    "claude",
    "chatgpt",
    "cursor",
    "gemini",
    "perplexity",
    "github",
  ]) {
    if (key.includes(id)) return brandIdFor(id);
  }
  return null;
}

export function AgentIcon({
  name,
  size = 32,
}: {
  name: string;
  size?: number;
}) {
  const id = agentBrandId(name);
  if (id) return <BrandIcon id={id} size={size} />;
  return (
    <span
      className="ag-mono"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        fontSize: size * 0.4,
      }}
    >
      {name.trim().slice(0, 1).toUpperCase() || "·"}
    </span>
  );
}
