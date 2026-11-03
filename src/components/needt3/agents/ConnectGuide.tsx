"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { FiCopy } from "react-icons/fi";

import { notify } from "@/lib/notifications";

import { AgBtn, AgSection } from "./AgParts";
import { PROTOCOL_PROMPT, TOKENS_HREF, guideSnippets } from "./connect-guide";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(`${what} copied`);
  } catch {
    notify.error("Could not copy");
  }
}

function CodeBlock({
  id,
  title,
  hint,
  text,
}: {
  id: string;
  title: string;
  hint?: string;
  text: string;
}) {
  return (
    <div className="ag-token" data-ag-snippet={id}>
      <span className="ag-title">{title}</span>
      {hint ? <span className="ag-meta">{hint}</span> : null}
      <code className="ag-code">{text}</code>
      <span className="ag-token-row">
        <span />
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-ag-copy={id}
          onClick={() => void copy(text, title)}
        >
          <FiCopy size={13} aria-hidden />
          Copy
        </button>
      </span>
    </div>
  );
}

/**
 * How a new account connects its first agent: a named token, the line that
 * points a client at Needt, and the prompt that teaches the agent the hub.
 */
export function ConnectGuide({ onClose }: { onClose?: () => void }) {
  const [origin, setOrigin] = useState("https://use.needt.app");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div data-ag-guide="">
      <AgSection
        title="1. Create a token"
        hint="Each agent gets its own token."
      >
        <div className="ag-form">
          <span className="ag-meta">
            Make a named token in Connections, under Needt API. It is shown
            once.
          </span>
          <Link
            href={TOKENS_HREF}
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-ag-tokens-link=""
          >
            Open Connections
          </Link>
        </div>
      </AgSection>
      <AgSection
        title="2. Point the agent at Needt"
        hint="Replace <token> with the one you made."
      >
        {guideSnippets(origin).map((s) => (
          <CodeBlock key={s.id} {...s} />
        ))}
      </AgSection>
      <AgSection
        title="3. Give it the protocol"
        hint="Paste this into the agent's standing instructions. Risky steps wait for you."
      >
        <CodeBlock id="protocol" title="Hub protocol" text={PROTOCOL_PROMPT} />
      </AgSection>
      {onClose ? (
        <div className="ag-footer">
          <AgBtn tone="text" onClick={onClose}>
            Hide guide
          </AgBtn>
        </div>
      ) : null}
    </div>
  );
}
