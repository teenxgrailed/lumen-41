import {
  TODOIST_RESOURCE_TYPES,
  type TodoistSnapshot,
  todoistSnapshotSchema,
} from "./types";

/**
 * Todoist over plain fetch (no SDK): the OAuth code exchange and one full
 * sync. Every failure becomes a TodoistApiError whose `code` the run stores
 * as a warning, so the person sees why the import stopped.
 */

export const TODOIST_AUTHORIZE_URL = "https://app.todoist.com/oauth/authorize";
export const TODOIST_TOKEN_URL = "https://api.todoist.com/oauth/access_token";
export const TODOIST_SYNC_URL = "https://api.todoist.com/api/v1/sync";
export const TODOIST_SCOPE = "data:read";

const REQUEST_TIMEOUT_MS = 60_000;

export type TodoistErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "bad_response";

export class TodoistApiError extends Error {
  constructor(
    public readonly code: TodoistErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "TodoistApiError";
  }
}

export interface TodoistOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** Null when TODOIST_CLIENT_ID / TODOIST_CLIENT_SECRET are not set. */
export function getTodoistOAuthConfig(): TodoistOAuthConfig | null {
  const clientId = process.env.TODOIST_CLIENT_ID?.trim();
  const clientSecret = process.env.TODOIST_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function buildTodoistAuthorizeUrl(
  config: TodoistOAuthConfig,
  state: string
): string {
  const url = new URL(TODOIST_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", TODOIST_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

function errorForStatus(status: number): TodoistApiError {
  if (status === 401 || status === 403) {
    return new TodoistApiError(
      "unauthorized",
      "Todoist did not accept the access. Connect again and retry.",
      status
    );
  }
  if (status === 429) {
    return new TodoistApiError(
      "rate_limited",
      "Todoist is limiting requests right now. Try again in 15 minutes.",
      status
    );
  }
  if (status >= 500) {
    return new TodoistApiError(
      "unavailable",
      "Todoist is not responding. Try again later.",
      status
    );
  }
  return new TodoistApiError(
    "bad_response",
    `Todoist answered with an unexpected status (${status}).`,
    status
  );
}

async function post(
  url: string,
  body: URLSearchParams,
  token: string | null,
  fetchImpl: typeof fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TodoistApiError(
      "unavailable",
      "Could not reach Todoist. Try again later."
    );
  }
  if (!response.ok) throw errorForStatus(response.status);
  try {
    return await response.json();
  } catch {
    throw new TodoistApiError(
      "bad_response",
      "Todoist sent a response that is not JSON."
    );
  }
}

export async function exchangeTodoistCode(
  config: TodoistOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const json = (await post(
    TODOIST_TOKEN_URL,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
    null,
    fetchImpl
  )) as { access_token?: unknown };
  if (typeof json?.access_token !== "string" || !json.access_token) {
    throw new TodoistApiError(
      "bad_response",
      "Todoist did not return an access token."
    );
  }
  return json.access_token;
}

/** One full sync of everything the importer reads. */
export async function fetchTodoistSnapshot(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<TodoistSnapshot> {
  const json = await post(
    TODOIST_SYNC_URL,
    new URLSearchParams({
      sync_token: "*",
      resource_types: JSON.stringify(TODOIST_RESOURCE_TYPES),
    }),
    token,
    fetchImpl
  );
  const parsed = todoistSnapshotSchema.safeParse(json);
  if (!parsed.success) {
    throw new TodoistApiError(
      "bad_response",
      "Todoist sent data in a shape Needt does not recognise."
    );
  }
  return parsed.data;
}
