import { logger } from "@/lib/logger";

import type {
  IntegrationActionInput,
  IntegrationCatalogItem,
  IntegrationConnectResult,
  IntegrationProvider,
} from "./provider";

const LOG_SOURCE = "ComposioIntegrationProvider";
const API_BASE = "https://backend.composio.dev/api/v3.1";

const CURATED_TOOLKITS: Omit<IntegrationCatalogItem, "configured">[] = [
  {
    slug: "notion",
    name: "Notion",
    description: "Search and update pages and databases",
    category: "notes",
  },
  {
    slug: "googlesheets",
    name: "Google Sheets",
    description: "Read and update spreadsheets",
    category: "files",
  },
  {
    slug: "googledrive",
    name: "Google Drive",
    description: "Find and organize files",
    category: "files",
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Read, draft, and organize email",
    category: "communication",
  },
  {
    slug: "outlook",
    name: "Microsoft Outlook",
    description: "Mail and calendar actions",
    category: "communication",
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Search messages and send updates",
    category: "communication",
  },
  {
    slug: "microsoftteams",
    name: "Microsoft Teams",
    description: "Messages, meetings, and collaboration",
    category: "communication",
  },
  {
    slug: "todoist",
    name: "Todoist",
    description: "Import and update tasks",
    category: "tasks",
  },
  {
    slug: "clickup",
    name: "ClickUp",
    description: "Tasks, lists, and workspaces",
    category: "tasks",
  },
  {
    slug: "asana",
    name: "Asana",
    description: "Projects and task actions",
    category: "tasks",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Issues and product projects",
    category: "developer",
  },
  {
    slug: "github",
    name: "GitHub",
    description: "Issues, pull requests, and repositories",
    category: "developer",
  },
  {
    slug: "gitlab",
    name: "GitLab",
    description: "Projects, issues, and merge requests",
    category: "developer",
  },
  {
    slug: "dropbox",
    name: "Dropbox",
    description: "Access and organize files",
    category: "files",
  },
  {
    slug: "airtable",
    name: "Airtable",
    description: "Read and update structured bases",
    category: "notes",
  },
  {
    slug: "trello",
    name: "Trello",
    description: "Boards, lists, and cards",
    category: "tasks",
  },
  {
    slug: "discord",
    name: "Discord",
    description: "Messages and community actions",
    category: "communication",
  },
  {
    slug: "openai",
    name: "OpenAI",
    description: "Connect AI workflows and files",
    category: "ai",
  },
];

function config() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  return apiKey ? { apiKey } : null;
}

async function composioRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const current = config();
  if (!current) throw new Error("Composio is not configured");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": current.apiKey,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Composio returned ${response.status}: ${details.slice(0, 200)}`
    );
  }
  return (await response.json()) as T;
}

export class ComposioIntegrationProvider implements IntegrationProvider {
  readonly id = "composio";

  isConfigured() {
    return Boolean(config());
  }

  async listCatalog() {
    return CURATED_TOOLKITS.map((toolkit) => ({
      ...toolkit,
      configured: this.isConfigured(),
    }));
  }

  async initiateConnection(input: {
    userId: string;
    toolkit: string;
    callbackUrl: string;
  }): Promise<IntegrationConnectResult> {
    if (
      !CURATED_TOOLKITS.some((candidate) => candidate.slug === input.toolkit)
    ) {
      throw new Error("Unsupported integration toolkit");
    }
    const session = await composioRequest<{ session_id: string }>(
      "/tool_router/session",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: input.userId,
          toolkits: { enabled: [input.toolkit] },
        }),
      }
    );
    const link = await composioRequest<{
      redirect_url: string;
      connected_account_id: string;
    }>(`/tool_router/session/${session.session_id}/link`, {
      method: "POST",
      body: JSON.stringify({
        toolkit: input.toolkit,
        callback_url: input.callbackUrl,
      }),
    });
    return {
      connectionId: link.connected_account_id,
      redirectUrl: link.redirect_url,
    };
  }

  async executeAction(input: IntegrationActionInput) {
    if (input.permission === "write" && !input.confirmed) {
      throw new Error("Write actions require explicit confirmation");
    }
    const session = await composioRequest<{ session_id: string }>(
      "/tool_router/session",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: input.userId,
          toolkits: { enabled: [input.toolkit] },
        }),
      }
    );
    await logger.info(
      "Executing confirmed external integration action",
      {
        userId: input.userId,
        toolkit: input.toolkit,
        tool: input.tool,
        permission: input.permission,
      },
      LOG_SOURCE
    );
    return composioRequest(
      `/tool_router/session/${session.session_id}/execute`,
      {
        method: "POST",
        body: JSON.stringify({
          tool_slug: input.tool,
          arguments: input.arguments,
        }),
      }
    );
  }

  /**
   * Deletes every Composio connection that belongs to the user and asks
   * Composio to revoke the upstream grant as well. The ids we stored are
   * joined with the ones Composio lists for the user, so a connection whose
   * callback never reached us is removed too. A connection already gone
   * (404) counts as removed, which makes a second run harmless.
   */
  async deleteUserConnections(
    userId: string,
    knownConnectionIds: string[] = []
  ): Promise<{ deleted: string[]; failed: string[] }> {
    if (!this.isConfigured()) return { deleted: [], failed: [] };
    const ids = new Set(knownConnectionIds.filter(Boolean));
    try {
      let cursor: string | null = null;
      for (let page = 0; page < 20; page += 1) {
        const query = new URLSearchParams({ user_ids: userId, limit: "100" });
        if (cursor) query.set("cursor", cursor);
        const listing: {
          items?: { id?: string; user_id?: string }[];
          next_cursor?: string | null;
        } = await composioRequest(`/connected_accounts?${query.toString()}`);
        for (const item of listing.items ?? []) {
          if (item.id && (!item.user_id || item.user_id === userId)) {
            ids.add(item.id);
          }
        }
        cursor = listing.next_cursor ?? null;
        if (!cursor) break;
      }
    } catch (error) {
      await logger.warn(
        "Could not list Composio connections for deletion",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await composioRequest(
          `/connected_accounts/${encodeURIComponent(id)}?revoke_on_delete=true`,
          { method: "DELETE" }
        );
        deleted.push(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("Composio returned 404")) {
          deleted.push(id);
          continue;
        }
        failed.push(id);
        await logger.warn(
          "Could not delete Composio connection",
          { connectionId: id, error: message },
          LOG_SOURCE
        );
      }
    }
    return { deleted, failed };
  }
}

export const composioProvider = new ComposioIntegrationProvider();
