"use client";

import { FiExternalLink } from "react-icons/fi";

import { GITHUB_REPO_URL } from "@/lib/version";

import { CopyRow, TokenStep } from "./AiSetup";
import { strings } from "./strings";
import type { McpConnect } from "./useMcpConnect";

/** The connector API guide, kept in the repository next to the code. */
export const API_DOCS_URL = `${GITHUB_REPO_URL}/blob/main/docs/connector-api.md`;

/**
 * What the "Needt API" tile opens: where a person makes a personal access
 * token (`POST /api/connector-settings`), the MCP address to point a client at,
 * and the connector API docs. Shared by the desktop sheet and the phone sheet.
 */
export function ApiAccess({ mcp }: { mcp: McpConnect }) {
  return (
    <div data-cn-api="">
      <span className="cn-sheet-title">{strings.apiTitle}</span>
      <p className="cn-meta">{strings.apiLead}</p>
      <ol className="cn-steps">
        <li className="cn-step">
          <span className="cn-step-n">1</span>
          <span className="cn-step-t">Create an access token</span>
          <div className="cn-step-x">
            <TokenStep mcp={mcp} />
          </div>
        </li>
        <li className="cn-step">
          <span className="cn-step-n">2</span>
          <span className="cn-step-t">
            {strings.apiMcpUrl}. Apps that sign in (Claude, ChatGPT) use this
          </span>
          <div className="cn-step-x">
            <CopyRow value={mcp.oauthUrl} what="MCP URL" />
          </div>
        </li>
        <li className="cn-step">
          <span className="cn-step-n">3</span>
          <span className="cn-step-t">
            Scripts and clients that send the token use this URL, with{" "}
            <span className="cn-path">Authorization: Bearer</span>
          </span>
          <div className="cn-step-x">
            <CopyRow value={mcp.url} what="API URL" />
          </div>
        </li>
      </ol>
      <a
        className="nx-btn nx-btn-secondary nx-btn-sm"
        data-cn-api-docs=""
        href={API_DOCS_URL}
        target="_blank"
        rel="noreferrer"
      >
        <FiExternalLink size={13} aria-hidden />
        {strings.apiDocs}
      </a>
    </div>
  );
}
