"use client";

import { useEffect, useRef } from "react";

const KEY = "needt:agents-onboarded";

/** Seen the first-visit onboarding on this device. */
export function onboardingSeen() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Private mode: it shows again next time, nothing breaks.
  }
}

/**
 * The first visit to Agents with nothing connected: a short "connect your
 * agents" panel over the Map. "Connect an agent" opens the guide on the
 * Agents tab; "Not now" leaves the Map. Either way it is not shown again on
 * this device.
 *
 * //todo: the visual waits for the owner's chosen style (05.11.26); the
 * steps and copy are placeholders that say only what the product does.
 * //todo: "seen" lives in this device's storage; a user setting would carry
 * it across devices.
 */
export function AgentsOnboarding({
  onDone,
  onConnect,
}: {
  onDone: () => void;
  onConnect: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      remember();
      onDone();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onDone]);
  return (
    <div
      className="ag-onboard"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ag-onboard-title"
      data-ag-onboarding=""
    >
      <h2 id="ag-onboard-title" className="ag-onboard-title">
        Connect your agents
      </h2>
      <p className="ag-onboard-line">
        Claude, ChatGPT, Codex or any MCP client can work from Needt: they take
        tasks, ask you when they need a decision, and leave notes for each
        other.
      </p>
      <ol className="ag-onboard-steps">
        <li>Add Needt to the agent, with a click or a token.</li>
        <li>Give it the hub protocol, so risky steps wait for you.</li>
        <li>Watch its work appear on this map.</li>
      </ol>
      <div className="ag-onboard-actions">
        <button
          ref={first}
          type="button"
          className="ag-btn"
          data-ag-onboard-connect=""
          onClick={() => {
            remember();
            onConnect();
          }}
        >
          Connect an agent
        </button>
        <button
          type="button"
          className="ag-btn is-quiet"
          data-ag-onboard-skip=""
          onClick={() => {
            remember();
            onDone();
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
