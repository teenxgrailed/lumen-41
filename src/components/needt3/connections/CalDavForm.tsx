"use client";

import { type FormEvent, useState } from "react";

import { FiAlertCircle, FiCheck } from "react-icons/fi";

import { ICloudGuide } from "./ICloudGuide";
import { explainCalDavFailure } from "./caldavErrors";
import { strings } from "./strings";

/** Tells 1Password, LastPass, Bitwarden and Chrome to stay out of the fields. */
const NO_MANAGER = {
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

const DEFAULT_SERVER = "https://caldav.icloud.com";

type Check =
  | { kind: "idle" }
  | { kind: "ok"; calendars: number | undefined }
  | { kind: "bad"; error: string };

/** Adds `https://` when missing and drops a trailing slash. */
export function normaliseServerUrl(raw: string) {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

async function readJson(res: Response) {
  return (await res.json().catch(() => null)) as {
    error?: unknown;
    success?: unknown;
    calendars?: unknown;
  } | null;
}

/**
 * Apple / iCloud (CalDAV) login, in the connect dialog's shell: the dialog
 * brings the title, this brings a one-line lead, three compact form rows on
 * the one 105 / 32 geometry (labels short enough to stay on one line), the
 * outcome of a test as a single line, and Test connection · Cancel · Connect.
 *
 * Autofill: the Apple ID is a `username` and the app password a
 * `new-password` (it is a fresh credential, not a saved Needt login), and the
 * common password managers are told to leave the form alone, so no overlay is
 * drawn over the fields.
 */
export function CalDavForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState<"test" | "connect" | null>(null);
  const [check, setCheck] = useState<Check>({ kind: "idle" });

  const missing = !server.trim() || !username.trim() || !password;
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setCheck({ kind: "idle" });
  };

  const body = () =>
    JSON.stringify({
      serverUrl: normaliseServerUrl(server),
      username: username.trim(),
      password,
      path: path.trim() || undefined,
    });

  const post = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(),
    });
    return { res, data: await readJson(res) };
  };

  const fail = (status: number, data: { error?: unknown } | null) =>
    explainCalDavFailure(
      status,
      typeof data?.error === "string" ? data.error : undefined
    );

  const test = async () => {
    if (missing) return setCheck({ kind: "bad", error: strings.caldavMissing });
    setBusy("test");
    try {
      const { res, data } = await post("/api/calendar/caldav/test");
      setCheck(
        res.ok && data?.success
          ? {
              kind: "ok",
              calendars: Array.isArray(data.calendars)
                ? data.calendars.length
                : undefined,
            }
          : { kind: "bad", error: fail(res.status, data) }
      );
    } catch {
      setCheck({ kind: "bad", error: fail(0, null) });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (missing) return setCheck({ kind: "bad", error: strings.caldavMissing });
    setBusy("connect");
    try {
      const { res, data } = await post("/api/calendar/caldav/auth");
      if (res.ok) return onSuccess();
      setCheck({ kind: "bad", error: fail(res.status, data) });
    } catch {
      setCheck({ kind: "bad", error: fail(0, null) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      className="cn-caldav"
      onSubmit={(e) => void submit(e)}
      noValidate
      data-cn-caldav=""
    >
      <span className="cn-meta">{strings.caldavLead}</span>
      <ICloudGuide />
      <div className="nt-form">
        <div className="nt-row">
          <label className="nt-row-label" htmlFor="cn-caldav-server">
            {strings.caldavServer}
          </label>
          <div className="nt-row-control">
            <input
              id="cn-caldav-server"
              className="nt-input"
              name="caldav-server"
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={server}
              onChange={(e) => edit(setServer)(e.target.value)}
              {...NO_MANAGER}
            />
          </div>
        </div>
        <div className="nt-row">
          <label className="nt-row-label" htmlFor="cn-caldav-user">
            {strings.caldavUser}
          </label>
          <div className="nt-row-control">
            <input
              id="cn-caldav-user"
              className="nt-input"
              name="username"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={strings.caldavUserPlaceholder}
              value={username}
              onChange={(e) => edit(setUsername)(e.target.value)}
              {...NO_MANAGER}
            />
          </div>
        </div>
        <div className="nt-row">
          <label className="nt-row-label" htmlFor="cn-caldav-password">
            {strings.caldavPassword}
          </label>
          <div className="nt-row-control">
            <input
              id="cn-caldav-password"
              className="nt-input"
              name="app-password"
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={strings.caldavPasswordPlaceholder}
              value={password}
              onChange={(e) => edit(setPassword)(e.target.value)}
              {...NO_MANAGER}
            />
          </div>
        </div>
        <div className="nt-row">
          <label className="nt-row-label" htmlFor="cn-caldav-path">
            {strings.caldavPath}
          </label>
          <div className="nt-row-control">
            <input
              id="cn-caldav-path"
              className="nt-input"
              name="caldav-path"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={strings.caldavPathPlaceholder}
              value={path}
              onChange={(e) => edit(setPath)(e.target.value)}
              {...NO_MANAGER}
            />
          </div>
        </div>
      </div>
      {check.kind !== "idle" ? (
        <span
          className={"cn-caldav-note" + (check.kind === "bad" ? " is-bad" : "")}
          role={check.kind === "bad" ? "alert" : "status"}
          data-cn-caldav-note={check.kind}
        >
          {check.kind === "bad" ? (
            <FiAlertCircle size={14} aria-hidden />
          ) : (
            <FiCheck size={14} aria-hidden />
          )}
          {check.kind === "bad"
            ? check.error
            : strings.caldavTested(check.calendars)}
        </span>
      ) : null}
      <div className="cn-caldav-foot">
        <button
          type="button"
          className="nx-btn nx-btn-text"
          data-cn-caldav-test=""
          disabled={!!busy}
          onClick={() => void test()}
        >
          {busy === "test" ? strings.caldavTesting : strings.caldavTest}
        </button>
        <span className="cn-caldav-foot-gap" />
        <button
          type="button"
          className="nx-btn nx-btn-text"
          disabled={busy === "connect"}
          onClick={onCancel}
        >
          {strings.caldavCancel}
        </button>
        <button
          type="submit"
          className="nx-btn nx-btn-primary"
          data-cn-caldav-connect=""
          disabled={!!busy}
        >
          {busy === "connect"
            ? strings.caldavConnecting
            : strings.caldavConnect}
        </button>
      </div>
    </form>
  );
}
