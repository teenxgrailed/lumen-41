"use client";

import { BrandIcon, brandIdFor } from "../brand";

/**
 * An agent's tile: the real brand mark when we have one (Claude, ChatGPT,
 * Cursor, Gemini, Perplexity, GitHub, Grok; Codex wears OpenAI's), the
 * generic plug tile otherwise (a named token, an MCP client we have no mark
 * for). Never a letter: a third-party app wears its real icon or none
 * (owner, 20.11.26). Brand colour stays inside its tile (owner, 05.11.26).
 */
const ALIAS: Record<string, string> = {
  codex: "openai",
  openai: "openai",
  gpt: "chatgpt",
  googlegemini: "gemini",
  grok: "grok",
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
    "needt",
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
  // No mark for this name: the generic plug tile, never a made-up logo.
  return <BrandIcon id={agentBrandId(name)} size={size} />;
}
