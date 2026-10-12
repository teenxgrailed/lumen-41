import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import {
  clientRedirect,
  validateAuthorizationRequest,
} from "@/services/oauth/authorize";
import {
  AUTHORIZE_PARAMS,
  SCOPE_LABELS,
  consentWorkspaces,
} from "@/services/oauth/consent";

import { Button } from "@/components/ui/button";

import { getAuthOptions } from "@/lib/auth/auth-options";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an app · Needt" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-[13px]">
        {children}
      </div>
    </main>
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

  const result = await validateAuthorizationRequest(params);
  if (!result.ok && result.kind === "page") {
    return (
      <Shell>
        <h1 className="text-[15px] font-semibold">This link cannot connect</h1>
        <p className="mt-2 text-muted-foreground">{result.description}</p>
        <p className="mt-3 text-[12px] text-muted-foreground">
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

  const { request } = result;
  const workspaces = await consentWorkspaces(session.user.id);
  const redirectHost = new URL(request.redirectUri).host;
  const wantsWrite = request.scopes.includes("needt.write");
  const wantsMail = request.scopes.includes("mail.read");

  return (
    <Shell>
      <h1 className="text-[15px] font-semibold">
        Connect {request.client.name} to Needt?
      </h1>
      <p className="mt-2 text-muted-foreground">
        {request.client.name} will act as {session.user.email ?? "you"}. After
        you allow it, Needt sends you back to{" "}
        <span className="font-medium text-foreground">{redirectHost}</span>.
      </p>
      {request.client.kind === "dcr" ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          This app registered itself; Needt cannot confirm who made it. Only
          continue if you started this connection.
        </p>
      ) : null}

      <form method="post" action="/oauth/authorize/decision" className="mt-5">
        {AUTHORIZE_PARAMS.map((key) => {
          const value = params.get(key);
          return value === null ? null : (
            <input key={key} type="hidden" name={key} value={value} />
          );
        })}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-[12px] font-medium text-muted-foreground">
            It may
          </legend>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked disabled className="mt-0.5" />
            <span>{SCOPE_LABELS["needt.read"]}</span>
          </label>
          {wantsWrite ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="write"
                defaultChecked
                className="mt-0.5"
              />
              <span>{SCOPE_LABELS["needt.write"]}</span>
            </label>
          ) : null}
          {wantsMail ? (
            <label className="flex items-start gap-2">
              <input type="checkbox" name="mail" className="mt-0.5" />
              <span>
                {SCOPE_LABELS["mail.read"]}
                <span className="block text-[12px] text-muted-foreground">
                  Off unless you tick it. Message bodies are not shared.
                </span>
              </span>
            </label>
          ) : null}
        </fieldset>

        <label className="mt-5 block">
          <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
            Only in this workspace
          </span>
          <select
            name="workspaceId"
            defaultValue={workspaces[0]?.workspace.id}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
          >
            {workspaces.map(({ workspace, role }) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} ({role.toLowerCase()})
              </option>
            ))}
          </select>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="submit" name="decision" value="deny" variant="outline">
            Cancel
          </Button>
          <Button
            type="submit"
            name="decision"
            value="allow"
            variant="secondary"
          >
            Allow
          </Button>
        </div>
        <p className="mt-4 text-[12px] text-muted-foreground">
          You can disconnect it any time in Settings › Connected apps.
        </p>
      </form>
    </Shell>
  );
}
