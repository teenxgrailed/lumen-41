"use client";

import { useState } from "react";

import { FiCopy, FiKey } from "react-icons/fi";

import { formatShortDate } from "@/lib/date-utils";
import { notify } from "@/lib/notifications";

import { BrandIcon, brandIdFor } from "../brand";
import { AI_META, type AiToolId, maskToken, richParts, stepData } from "./mcp";
import type { McpConnect, PersonalToken } from "./useMcpConnect";

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

const day = (v: string | null) =>
  v ? formatShortDate(new Date(v), true) : "never";

/** One line under a token's name: preview, last use, expiry. */
function tokenMeta(t: PersonalToken): string {
  const expiry = !t.expiresAt
    ? "does not expire"
    : t.expired
      ? `expired ${day(t.expiresAt)}`
      : `expires ${day(t.expiresAt)}`;
  return `${t.tokenPreview} · last used ${day(t.lastUsedAt)} · ${expiry}`;
}

function TokenRow({
  token: t,
  onRevoke,
}: {
  token: PersonalToken;
  onRevoke: () => void;
}) {
  return (
    <div className="cn-app-row" data-cn-token-row={t.id}>
      <span className="cn-setup-col">
        <span className="cn-c-name">{t.name}</span>
        <span className="cn-meta" data-cn-token-meta="">
          {tokenMeta(t)}
        </span>
      </span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary nx-btn-sm"
        data-cn-token-revoke={t.id}
        onClick={onRevoke}
      >
        Revoke
      </button>
    </div>
  );
}

/**
 * Personal access tokens: one per tool, so making one never disconnects
 * another. Each is listed with its name, preview and last use; a new one asks
 * for a name and is shown once with Copy.
 */
export function TokenStep({ mcp }: { mcp: McpConnect }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const tokens = mcp.tokens ?? [];
  const create = async () => {
    if (!name.trim() || mcp.making) return;
    if (await mcp.makeToken(name.trim())) {
      setNaming(false);
      setName("");
    }
  };
  return (
    <div className="cn-key-col">
      {mcp.token ? (
        <div className="cn-key-col">
          <span className="cn-meta" data-cn-token-name="">
            {mcp.tokenName}
          </span>
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
        </div>
      ) : null}
      {tokens.length ? (
        <div data-cn-tokens="">
          {tokens.map((t) => (
            <TokenRow
              key={t.id}
              token={t}
              onRevoke={() => void mcp.revokeToken(t)}
            />
          ))}
        </div>
      ) : null}
      {naming ? (
        <form
          className="nt-form"
          data-cn-token-form=""
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="nt-row">
            <label className="nt-row-label" htmlFor="cn-token-name">
              Name
            </label>
            <div className="nt-row-control">
              <input
                id="cn-token-name"
                className="nt-input"
                name="token-name"
                maxLength={60}
                autoComplete="off"
                autoFocus
                spellCheck={false}
                placeholder="Chrome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="cn-key-row">
            <button
              type="submit"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              data-cn-genkey=""
              disabled={mcp.making || !name.trim()}
            >
              <FiKey size={13} aria-hidden />
              Create token
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              data-cn-token-cancel=""
              onClick={() => {
                setNaming(false);
                setName("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="cn-key-row">
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-cn-newkey=""
            onClick={() => setNaming(true)}
          >
            <FiKey size={13} aria-hidden />
            New token
          </button>
        </div>
      )}
      <span className="cn-meta">
        {mcp.token
          ? `Copy it now, it is not shown again (${maskToken(mcp.token)}).`
          : "Treat a token like a password."}{" "}
        Name it after the tool that will use it (Grok Bot, Chrome, a script).
        Revoking one leaves the others connected.
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
