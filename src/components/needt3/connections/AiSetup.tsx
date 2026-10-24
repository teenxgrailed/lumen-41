"use client";

import { FiCopy, FiKey } from "react-icons/fi";

import { formatShortDate } from "@/lib/date-utils";
import { notify } from "@/lib/notifications";

import { BrandIcon, brandIdFor } from "../brand";
import { AI_META, type AiToolId, maskToken, richParts, stepData } from "./mcp";
import type { McpConnect, TokenExpiry } from "./useMcpConnect";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(`${what} copied`);
  } catch {
    notify.error("Could not copy");
  }
}

export function CopyRow({ value, what }: { value: string; what: string }) {
  return (
    <div className="cn-copy-row-row">
      <span className="cn-url" title={value} data-cn-url="">
        {value}
      </span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary nx-btn-sm"
        data-cn-copy-url=""
        onClick={() => void copy(value, what)}
      >
        <FiCopy size={13} aria-hidden />
        Copy
      </button>
    </div>
  );
}

/**
 * When the current token stops working. A token made before expiry existed has
 * no date and keeps working until it is rotated.
 */
function expiryLine(expiry: TokenExpiry | null): string {
  if (!expiry) return "";
  if (!expiry.at) return "It does not expire. ";
  const when = formatShortDate(expiry.at, true);
  return expiry.expired ? `It expired ${when}. ` : `It expires ${when}. `;
}

/** The access token: one click makes it, shown once with Copy. */
export function TokenStep({ mcp }: { mcp: McpConnect }) {
  return (
    <div className="cn-key-col">
      {mcp.token ? (
        <div className="cn-copy-row-row">
          <span className="cn-url" data-cn-token="shown">
            {mcp.token}
          </span>
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-cn-copy-key=""
            onClick={() => void copy(mcp.token ?? "", "Token")}
          >
            <FiCopy size={13} aria-hidden />
            Copy
          </button>
        </div>
      ) : null}
      <div className="cn-key-row">
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-cn-genkey=""
          disabled={mcp.making}
          onClick={() => void mcp.makeToken()}
        >
          <FiKey size={13} aria-hidden />
          {mcp.hasToken || mcp.token ? "Create a new token" : "Create token"}
        </button>
      </div>
      <span className="cn-meta">
        {mcp.token
          ? `Copy it now, it is not shown again (${maskToken(mcp.token)}).`
          : mcp.tokenExpiry?.expired
            ? "Tools using your token are disconnected."
            : mcp.hasToken
              ? "You already have a token; it can't be shown again."
              : "Treat it like a password."}{" "}
        <span data-cn-token-expiry="">{expiryLine(mcp.tokenExpiry)}</span>A new
        token disconnects every agent using the old one.
      </span>
    </div>
  );
}

/**
 * The numbered setup steps for one AI tool (connections.jsx `CnSetup`), shared
 * by the desktop sheet and the phone sheet. "Check connection" is left out: no
 * route reports whether a client reached Needt (//todo with the access-link
 * routes); signed-in apps appear under Connected apps once approved.
 */
export function AiSetup({ id, mcp }: { id: AiToolId; mcp: McpConnect }) {
  const m = AI_META[id];
  const url = m.oauth ? (mcp.oauthUrl ?? mcp.url) : mcp.url;
  const steps = stepData(id, {
    url,
    oauthUrl: mcp.oauthUrl,
    token: mcp.token,
  });
  return (
    <>
      <div className="cn-setup-row">
        <BrandIcon id={brandIdFor(id)} size={44} />
        <span className="cn-setup-col">
          <span className="cn-sheet-title">
            Connect {id === "othermcp" ? "an MCP client" : m.label}
          </span>
          <span className="cn-meta">
            Reads your tasks, calendar and notes through Needt MCP
          </span>
        </span>
        <span className="cn-badge cn-setup-el">Beta</span>
      </div>
      <ol className="cn-steps" data-cn-steps={id}>
        {steps.map((s, i) => (
          <li key={i} className="cn-step">
            <span className="cn-step-n">{i + 1}</span>
            <span className="cn-step-t">
              {richParts(s.t).map((p, k) =>
                p.kind === "b" ? (
                  <b key={k}>{p.text}</b>
                ) : p.kind === "path" ? (
                  <span key={k} className="cn-path">
                    {p.text}
                  </span>
                ) : (
                  p.text
                )
              )}
            </span>
            {s.x ? (
              <div className="cn-step-x">
                {s.x === "url" ? (
                  <CopyRow value={url} what="Server URL" />
                ) : s.x === "token" ? (
                  <TokenStep mcp={mcp} />
                ) : (
                  <div className="cn-code-box">
                    <pre className="cn-code" data-cn-code="">
                      {s.x.code}
                    </pre>
                    <button
                      type="button"
                      className="nx-btn nx-btn-secondary nx-btn-sm cn-code-copy"
                      data-cn-copy-config=""
                      onClick={() =>
                        void copy(
                          s.x ? (s.x as { copy: string }).copy : "",
                          "Config"
                        )
                      }
                    >
                      <FiCopy size={13} aria-hidden />
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}
