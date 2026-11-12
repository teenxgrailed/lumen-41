import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  clientRedirect,
  completeFirstPartyAuthorization,
  validateAuthorizationRequest,
} from "@/services/oauth/authorize";
import { clientOrigin } from "@/services/oauth/clients";
import {
  AUTHORIZE_PARAMS,
  SCOPE_LABELS,
  consentWorkspaces,
} from "@/services/oauth/consent";
import {
  AUTHORIZE_LIMIT_PER_MINUTE,
  cimdFetchGuard,
  ipFromHeaders,
  limitAuthorize,
} from "@/services/oauth/limits";

import { PublicScope } from "@/components/needt3/states/PublicScope";

import { isAdminUserId } from "@/lib/auth/admin-role";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

import { WorkspacePicker } from "./WorkspacePicker";

export const dynamic = "force-dynamic";
export const metadata = { title: SECTION_TITLES.connectApp };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PublicScope>
      <main className="pub-center">
        <div className="pub-card pub-oauth-card">{children}</div>
      </main>
    </PublicScope>
  );
}

/**
 * OAuth consent for MCP clients (claude.ai, ChatGPT, Claude Code). Shows who
 * asks, where the answer goes, and what they may do; the person picks the
 * workspace the connection is limited to. The decision is a plain form POST
 * to /oauth/authorize/decision, which validates everything again.
 */
export default async function AuthorizePage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of AUTHORIZE_PARAMS) {
    const value = raw[key];
    if (typeof value === "string") params.set(key, value);
  }

  // Before anything that could fetch a client document: per-IP limit.
  const ip = ipFromHeaders(await headers());
  if (
    await limitAuthorize(ip, "/oauth/authorize", AUTHORIZE_LIMIT_PER_MINUTE)
  ) {
    return (
      <Shell>
        <h1 className="pub-card-title">Too many attempts</h1>
        <p className="pub-lead">
          Wait a minute and start the connection again.
        </p>
      </Shell>
    );
  }

  const result = await validateAuthorizationRequest(params, {
    allowFetch: cimdFetchGuard(ip, "/oauth/authorize"),
  });
  if (!result.ok && result.kind === "page") {
    return (
      <Shell>
        <h1 className="pub-card-title">This link cannot connect</h1>
        <p className="pub-lead">{result.description}</p>
        <p className="pub-meta pub-oauth-note">
          Nothing was shared. Start the connection again from the app you came
          from.
        </p>
      </Shell>
    );
  }
  if (!result.ok) {
    redirect(
      clientRedirect(result.redirectUri, {
        error: result.error,
        error_description: result.description,
        state: result.state,
      })
    );
  }

  const session = await getServerSession(await getAuthOptions());
  if (!session?.user?.id) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`
    );
  }

  const verification = await getEmailVerificationStatus(session.user.id);
  if (verification.required && !verification.verified) {
    return (
      <Shell>
        <h1 className="pub-card-title">Confirm your email first</h1>
        <p className="pub-lead">
          Open Needt and confirm {verification.email ?? "your email"}, then
          start the connection again.
        </p>
        <p className="pub-meta pub-oauth-note">Nothing was shared.</p>
      </Shell>
    );
  }

  const { request } = result;
  // Needt's own apps (sign in with a Needt account) get no consent screen.
  if (request.oidc) {
    redirect(await completeFirstPartyAuthorization(request, session.user.id));
  }
  const [workspaces, offerAdmin] = await Promise.all([
    consentWorkspaces(session.user.id),
    isAdminUserId(session.user.id),
  ]);
  const redirectHost = new URL(request.redirectUri).host;
  const origin = clientOrigin(request.client, request.redirectUri);
  const wantsWrite = request.scopes.includes("needt.write");
  const wantsMail = request.scopes.includes("mail.read");

  return (
    <Shell>
      <h1 className="pub-card-title">
        Connect {request.client.name} to Needt?
      </h1>
      <p className="pub-meta pub-oauth-host" data-client-host>
        from <span className="pub-oauth-strong">{origin.host}</span>
      </p>
      <p className="pub-lead">
        {request.client.name} will act as {session.user.email ?? "you"}. After
        you allow it, Needt sends you back to{" "}
        <span className="pub-oauth-strong">{redirectHost}</span>.
      </p>
      {origin.trusted ? null : (
        <p className="pub-meta pub-oauth-caution" data-client-caution>
          Needt cannot confirm who made this app; the name is what the app says
          about itself. Only continue if you started this connection from{" "}
          {origin.host}.
        </p>
      )}

      <form
        method="post"
        action="/oauth/authorize/decision"
        className="pub-oauth-form"
      >
        {AUTHORIZE_PARAMS.map((key) => {
          const value = params.get(key);
          return value === null ? null : (
            <input key={key} type="hidden" name={key} value={value} />
          );
        })}

        <fieldset className="pub-oauth-scopes">
          <legend className="pub-oauth-legend">It may</legend>
          <label className="pub-oauth-check">
            <input type="checkbox" checked disabled className="pub-oauth-box" />
            <span>{SCOPE_LABELS["needt.read"]}</span>
          </label>
          {wantsWrite ? (
            <label className="pub-oauth-check">
              <input
                type="checkbox"
                name="write"
                defaultChecked
                className="pub-oauth-box"
              />
              <span>{SCOPE_LABELS["needt.write"]}</span>
            </label>
          ) : null}
          {wantsMail ? (
            <label className="pub-oauth-check">
              <input type="checkbox" name="mail" className="pub-oauth-box" />
              <span>
                {SCOPE_LABELS["mail.read"]}
                <span className="pub-oauth-hint">
                  Off unless you tick it. Message bodies are not shared.
                </span>
              </span>
            </label>
          ) : null}
          {offerAdmin ? (
            <label className="pub-oauth-check" data-consent-admin>
              <input type="checkbox" name="admin" className="pub-oauth-box" />
              <span>
                {SCOPE_LABELS["needt.admin.read"]}
                <span className="pub-oauth-hint">
                  Off unless you tick it. Read only: it cannot change plans,
                  flags or accounts. Every read is recorded in the admin audit
                  log.
                </span>
              </span>
            </label>
          ) : null}
        </fieldset>

        <div className="pub-oauth-workspace">
          <span className="pub-oauth-legend">Only in this workspace</span>
          <WorkspacePicker
            workspaces={workspaces.map(({ workspace, role }) => ({
              id: workspace.id,
              label: `${workspace.name} (${role.toLowerCase()})`,
            }))}
          />
        </div>

        <div className="pub-oauth-actions">
          <button
            type="submit"
            name="decision"
            value="deny"
            className="nx-btn nx-btn-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            className="nx-btn nx-btn-primary"
          >
            Allow
          </button>
        </div>
        <p className="pub-meta pub-oauth-note">
          You can disconnect it any time in Settings › Connected apps.
        </p>
      </form>
    </Shell>
  );
}
