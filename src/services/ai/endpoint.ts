/**
 * Where the hosted AI key points. Pure and env-driven so it can be tested and
 * so nothing here ever sees the key itself.
 *
 * Env (all optional, read once at import by `usage.ts`):
 * - `NEEDT_AI_BASE_URL`: an OpenAI-compatible base URL. Default: OpenRouter.
 * - `NEEDT_AI_MODEL`: the model id that host expects.
 * - `NEEDT_AI_API_KEY`: the key (read where it is used, never logged).
 */
export const DEFAULT_HOSTED_AI_MODEL = "z-ai/glm-5.3-flash";
export const DEFAULT_HOSTED_AI_BASE_URL = "https://openrouter.ai/api/v1";

/** Z.ai's own model code for GLM 5.3 Flash (https://docs.z.ai/guides/vlm/glm-5.3-flash). */
export const ZAI_NATIVE_MODEL = "glm-5.3-flash";
/** Z.ai's international endpoint (https://docs.z.ai/api-reference/introduction). */
export const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";

export type AiHostKind = "openrouter" | "zai" | "other";

const ZAI_HOSTS = new Set(["api.z.ai", "open.bigmodel.cn"]);

export function aiHostKind(baseUrl: string): AiHostKind {
  let hostname = "";
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (hostname === "openrouter.ai" || hostname.endsWith(".openrouter.ai")) {
    return "openrouter";
  }
  if (ZAI_HOSTS.has(hostname)) return "zai";
  return "other";
}

export function resolveHostedAiEndpoint(
  env: Record<string, string | undefined>
) {
  const baseUrl = env.NEEDT_AI_BASE_URL?.trim() || DEFAULT_HOSTED_AI_BASE_URL;
  const kind = aiHostKind(baseUrl);
  const configured = env.NEEDT_AI_MODEL?.trim();
  let model =
    configured || (kind === "zai" ? ZAI_NATIVE_MODEL : DEFAULT_HOSTED_AI_MODEL);
  // OpenRouter ids are "vendor/model"; Z.ai's own API takes the bare code.
  if (kind === "zai" && model.includes("/")) {
    model = model.slice(model.lastIndexOf("/") + 1);
  }
  return { baseUrl, model, kind };
}
