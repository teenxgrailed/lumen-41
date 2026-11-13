import { NextRequest } from "next/server";

import { GET as logoutGet } from "@/app/oauth/logout/route";
import SigningOutPage from "@/app/oauth/logout/signing-out/page";
import { resolvePostLogoutTarget } from "@/services/oauth/logout";

// The page's v3 scope pulls in CSS and next/font; neither runs in Node.
jest.mock("@/components/needt3/states/PublicScope", () => ({
  PublicScope: ({ children }: { children: unknown }) => children,
}));

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
// The sign-out button itself is a client component; only its props matter here.
jest.mock("@/app/oauth/logout/signing-out/SignOutAndReturn", () => ({
  SignOutAndReturn: () => null,
}));

const ISSUER = "https://use.needt.app";
const BUDGET_REDIRECT = "https://budget.needt.app/auth/needt/callback";

const original = { ...process.env };
beforeEach(() => {
  process.env.NEXTAUTH_URL = ISSUER;
  process.env.OIDC_BUDGET_REDIRECT_URIS = BUDGET_REDIRECT;
});
afterAll(() => {
  process.env = original;
});

/** The `to` the page hands its sign-out button, wherever it sits in the tree. */
function toOf(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const { props } = node as {
    props?: { to?: string; children?: unknown };
  };
  if (props?.to !== undefined) return props.to;
  const children = ([] as unknown[]).concat(props?.children ?? []);
  return children.map(toOf).find((to) => to !== undefined);
}

function logout(query: Record<string, string>) {
  return logoutGet(
    new NextRequest(`${ISSUER}/oauth/logout?${new URLSearchParams(query)}`)
  );
}

/** Where the sign-out page would send the person once they are signed out. */
async function landing(response: Response) {
  const next = new URL(response.headers.get("location")!);
  expect(next.origin + next.pathname).toBe(
    `${ISSUER}/oauth/logout/signing-out`
  );
  const page = await SigningOutPage({
    searchParams: Promise.resolve(Object.fromEntries(next.searchParams)),
  });
  return toOf(page);
}

describe("OIDC logout", () => {
  it("logout redirects only to a registered post logout uri", async () => {
    const response = await logout({
      client_id: "needt-budget",
      post_logout_redirect_uri: "https://budget.needt.app/login",
      state: "s-1",
    });
    expect(response.status).toBe(307);
    expect(await landing(response)).toBe(
      "https://budget.needt.app/login?state=s-1"
    );
    expect(
      resolvePostLogoutTarget("needt-budget", "https://budget.needt.app/login")
    ).toBe("https://budget.needt.app/login");
  });

  it("logout with an unknown uri lands on the home page", async () => {
    for (const uri of [
      "https://evil.example/login",
      "https://budget.needt.app.evil.example/login",
      "http://budget.needt.app/login",
      "https://budget.needt.app:8443/login",
      "https://user:pw@budget.needt.app/login",
      "https://budget.needt.app/login#frag",
      "javascript:alert(1)",
      "//evil.example",
      "/relative",
      "not a url",
    ]) {
      const response = await logout({
        client_id: "needt-budget",
        post_logout_redirect_uri: uri,
      });
      expect(response.headers.get("location")).not.toContain("evil");
      expect(await landing(response)).toBe("/");
    }
  });

  it("lands on the home page for an unknown client or no parameters at all", async () => {
    expect(
      await landing(
        await logout({
          client_id: "ndt_client_someone",
          post_logout_redirect_uri: "https://budget.needt.app/login",
        })
      )
    ).toBe("/");
    expect(await landing(await logout({}))).toBe("/");
    expect(
      await landing(
        await logout({
          post_logout_redirect_uri: "https://budget.needt.app/login",
        })
      )
    ).toBe("/");
  });

  it("the sign-out page does not trust its own query: it checks the uri again", async () => {
    const page = await SigningOutPage({
      searchParams: Promise.resolve({
        client_id: "needt-budget",
        post_logout_redirect_uri: "https://evil.example/",
      }),
    });
    expect(toOf(page)).toBe("/");
  });

  it("follows OIDC_BUDGET_REDIRECT_URIS: a local Budget is registered by its origin", () => {
    process.env.OIDC_BUDGET_REDIRECT_URIS =
      "http://localhost:8000/auth/needt/callback";
    expect(
      resolvePostLogoutTarget("needt-budget", "http://localhost:8000/login")
    ).toBe("http://localhost:8000/login");
    expect(
      resolvePostLogoutTarget("needt-budget", "https://budget.needt.app/login")
    ).toBe("/");
  });
});
