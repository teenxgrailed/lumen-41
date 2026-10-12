import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

import { SIGN_IN_PROVIDER_IDS } from "@/lib/auth/sign-in-provider-ids";
import {
  APPLE_SECRET_MAX_SECONDS,
  SIGN_IN_SCOPES,
  type SignInProviderConfig,
  buildSignInProviders,
  crossSiteCallbackCookies,
  normalizeApplePrivateKey,
  readSignInProviderConfig,
  resetSignInProviderConfigCache,
  signAppleClientSecret,
} from "@/lib/auth/sign-in-providers";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/secret-encryption";

jest.mock("@/lib/prisma", () => ({
  prisma: { systemSettings: { findFirst: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const P8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const EMPTY: SignInProviderConfig = {
  google: { clientId: "", clientSecret: "" },
  "azure-ad": { clientId: "", clientSecret: "", tenantId: "" },
  apple: { clientId: "", teamId: "", keyId: "", privateKey: "" },
  github: { clientId: "", clientSecret: "" },
  discord: { clientId: "", clientSecret: "" },
  twitter: { clientId: "", clientSecret: "" },
  linkedin: { clientId: "", clientSecret: "" },
  openai: { clientId: "", clientSecret: "" },
};

const ALL: SignInProviderConfig = {
  google: { clientId: "g", clientSecret: "gs" },
  "azure-ad": { clientId: "m", clientSecret: "ms", tenantId: "common" },
  apple: {
    clientId: "app.needt.signin",
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    privateKey: P8,
  },
  github: { clientId: "gh", clientSecret: "ghs" },
  discord: { clientId: "d", clientSecret: "ds" },
  twitter: { clientId: "x", clientSecret: "xs" },
  linkedin: { clientId: "l", clientSecret: "ls" },
  openai: { clientId: "oaiapp_1", clientSecret: "os" },
};

type AnyProvider = {
  id: string;
  options?: Record<string, unknown>;
  [key: string]: unknown;
};

const ids = (config: SignInProviderConfig) =>
  (buildSignInProviders(config) as unknown as AnyProvider[])
    .map((p) => p.id)
    .sort();

const byId = (config: SignInProviderConfig, id: string) =>
  (buildSignInProviders(config) as unknown as AnyProvider[]).find(
    (p) => p.id === id
  )!;

/** What NextAuth would end up with: defaults, then the options on top. */
const effective = (p: AnyProvider) => ({ ...p, ...(p.options ?? {}) });
const scopeOf = (p: AnyProvider) => {
  const e = effective(p) as {
    authorization?: { params?: { scope?: string } } | string;
  };
  const fromOptions = (
    p.options?.authorization as { params?: { scope?: string } } | undefined
  )?.params?.scope;
  if (fromOptions) return fromOptions;
  if (typeof e.authorization === "string")
    return new URL(e.authorization).searchParams.get("scope");
  return e.authorization?.params?.scope;
};

describe("buildSignInProviders", () => {
  it("offers nothing when nothing is configured", () => {
    expect(buildSignInProviders(EMPTY)).toEqual([]);
  });

  it("offers exactly the configured providers", () => {
    expect(ids({ ...EMPTY, github: ALL.github })).toEqual(["github"]);
    expect(
      ids({ ...EMPTY, discord: ALL.discord, linkedin: ALL.linkedin })
    ).toEqual(["discord", "linkedin"]);
    expect(ids(ALL)).toEqual([...SIGN_IN_PROVIDER_IDS].sort());
  });

  it("hides a provider that is only half configured", () => {
    expect(
      ids({ ...EMPTY, github: { clientId: "gh", clientSecret: "" } })
    ).toEqual([]);
    expect(ids({ ...EMPTY, apple: { ...ALL.apple, privateKey: "" } })).toEqual(
      []
    );
    expect(
      ids({ ...EMPTY, "azure-ad": { ...ALL["azure-ad"], tenantId: "" } })
    ).toEqual([]);
  });

  it("drops Apple, and only Apple, when its key cannot sign", () => {
    expect(
      ids({ ...ALL, apple: { ...ALL.apple, privateKey: "not a key" } })
    ).not.toContain("apple");
    expect(
      ids({ ...ALL, apple: { ...ALL.apple, privateKey: "not a key" } })
    ).toHaveLength(SIGN_IN_PROVIDER_IDS.length - 1);
  });

  it("asks every provider for sign-in scopes only, never calendar or mail", () => {
    for (const p of buildSignInProviders(ALL) as unknown as AnyProvider[]) {
      const scope = scopeOf(p) ?? "";
      expect(scope).toBe(SIGN_IN_SCOPES[p.id as keyof typeof SIGN_IN_SCOPES]);
      for (const token of scope.split(" "))
        expect(token).not.toMatch(
          /calendar|gmail|Mail\.|tasks|drive|offline|chatgpt\.tokens/i
        );
    }
    expect(SIGN_IN_SCOPES.google).toBe("openid email profile");
    expect(SIGN_IN_SCOPES.openai).toBe("openid profile email");
  });

  it("lets X keep NextAuth's never-link default; the rest rely on the gate", () => {
    for (const p of buildSignInProviders(ALL) as unknown as AnyProvider[]) {
      const allow = effective(p).allowDangerousEmailAccountLinking === true;
      expect(allow).toBe(p.id !== "twitter");
    }
  });

  it("Microsoft reads the ID token, so tid and xms_edov reach the profile", () => {
    const ms = effective(byId(ALL, "azure-ad")) as AnyProvider & {
      idToken?: boolean;
      wellKnown: string;
    };
    expect(ms.idToken).toBe(true);
    // the multi-tenant discovery URL, which openid-client recognises and
    // validates `iss` against the token's own tid
    expect(ms.wellKnown).toMatch(
      /^https:\/\/login\.microsoftonline\.com\/common\/v2\.0\/\.well-known\/openid-configuration/
    );
  });

  it("Microsoft profile: email only when xms_edov, photo still fetched", async () => {
    const fetchMock = jest.fn(async () => ({ ok: false }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    const ms = byId(ALL, "azure-ad") as unknown as {
      profile: (
        p: unknown,
        t: unknown
      ) => Promise<{ id: string; email: string | null }>;
    };
    const tokens = { access_token: "at" };
    const claims = { sub: "ms-sub", name: "Ann", email: "Ann@Corp.com" };
    await expect(
      ms.profile({ ...claims, tid: "corp" }, tokens)
    ).resolves.toMatchObject({ id: "ms-sub", email: null });
    await expect(
      ms.profile(
        { ...claims, tid: "9188040d-6c67-4c5b-b112-36a304b66dad" },
        tokens
      )
    ).resolves.toMatchObject({ email: null });
    await expect(
      ms.profile({ ...claims, tid: "corp", xms_edov: true }, tokens)
    ).resolves.toMatchObject({ id: "ms-sub", email: "ann@corp.com" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("graph.microsoft.com/v1.0/me/photos"),
      expect.objectContaining({ headers: { Authorization: "Bearer at" } })
    );
  });

  it("Sign in with ChatGPT: OpenAI OIDC with PKCE, state and nonce", () => {
    const openai = byId(ALL, "openai") as AnyProvider & {
      wellKnown: string;
      checks: string[];
      client: { token_endpoint_auth_method: string };
    };
    expect(openai.wellKnown).toBe(
      "https://auth.openai.com/.well-known/openid-configuration"
    );
    expect(openai.checks).toEqual(["pkce", "state", "nonce"]);
    expect(openai.client.token_endpoint_auth_method).toBe(
      "client_secret_basic"
    );
    // a public client has no secret and authenticates with none
    const pub = byId(
      { ...EMPTY, openai: { clientId: "oaiapp_1", clientSecret: "" } },
      "openai"
    ) as AnyProvider & { client: { token_endpoint_auth_method: string } };
    expect(pub.client.token_endpoint_auth_method).toBe("none");
    expect(pub.clientSecret).toBeUndefined();
  });

  it("puts only a verified email on the user NextAuth creates", async () => {
    const discord = byId(ALL, "discord") as unknown as {
      profile: (p: unknown, t: unknown) => Promise<{ email: string | null }>;
    };
    const raw = {
      id: "1",
      username: "ann",
      avatar: null,
      discriminator: "0",
      email: "Ann@Example.com",
    };
    await expect(
      discord.profile({ ...raw, verified: false }, {})
    ).resolves.toMatchObject({ email: null });
    await expect(
      discord.profile({ ...raw, verified: true }, {})
    ).resolves.toMatchObject({ email: "ann@example.com" });

    const github = byId(ALL, "github") as unknown as {
      profile: (p: unknown, t: unknown) => Promise<{ email: string | null }>;
    };
    await expect(
      github.profile({ id: 7, login: "ann", email: "public@example.com" }, {})
    ).resolves.toMatchObject({ email: null });
  });
});

describe("Apple's client secret", () => {
  const decode = (part: string) =>
    JSON.parse(Buffer.from(part, "base64url").toString()) as Record<
      string,
      unknown
    >;

  it("is an ES256 JWT Apple accepts, well inside six months", () => {
    const now = 1_800_000_000;
    const jwt = signAppleClientSecret(ALL.apple, now);
    const [h, p, s] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const payload = decode(p);
    expect(payload).toMatchObject({
      iss: "TEAM123456",
      sub: "app.needt.signin",
      aud: "https://appleid.apple.com",
      iat: now,
    });
    expect((payload.exp as number) - now).toBeLessThan(
      APPLE_SECRET_MAX_SECONDS
    );
    expect(
      verify(
        "sha256",
        Buffer.from(`${h}.${p}`),
        { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" },
        Buffer.from(s, "base64url")
      )
    ).toBe(true);
  });

  it("reads the key however it was pasted", () => {
    const flat = P8.replace(/\n/g, "");
    const escaped = P8.replace(/\n/g, "\\n");
    const body = P8.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
    for (const pasted of [P8, flat, escaped, body])
      expect(normalizeApplePrivateKey(pasted)).toBe(P8.trim());
  });
});

describe("readSignInProviderConfig", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    resetSignInProviderConfigCache();
    process.env.DATABASE_URL ||= "postgresql://localhost/test";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("prefers System Settings, decrypts secrets, and falls back to env", async () => {
    process.env.GITHUB_CLIENT_ID = "env-gh";
    process.env.GITHUB_CLIENT_SECRET = "env-ghs";
    process.env.DISCORD_CLIENT_ID = "env-d";
    process.env.DISCORD_CLIENT_SECRET = "env-ds";
    jest.mocked(prisma.systemSettings.findFirst).mockResolvedValue({
      id: "default",
      githubClientId: "db-gh",
      githubClientSecret: encryptSecret("db-ghs"),
      discordClientId: null,
      discordClientSecret: null,
    } as never);
    const config = await readSignInProviderConfig();
    expect(config.github).toEqual({
      clientId: "db-gh",
      clientSecret: "db-ghs",
    });
    expect(config.discord).toEqual({
      clientId: "env-d",
      clientSecret: "env-ds",
    });
    expect(config.twitter).toEqual({ clientId: "", clientSecret: "" });
  });

  it("reads Google and Microsoft from the same columns, tenant common by default", async () => {
    jest.mocked(prisma.systemSettings.findFirst).mockResolvedValue({
      googleClientId: "db-g",
      googleClientSecret: encryptSecret("db-gs"),
      outlookClientId: "db-m",
      outlookClientSecret: encryptSecret("db-ms"),
      outlookTenantId: null,
    } as never);
    delete process.env.AZURE_AD_TENANT_ID;
    const config = await readSignInProviderConfig();
    expect(config.google).toEqual({ clientId: "db-g", clientSecret: "db-gs" });
    expect(config["azure-ad"]).toEqual({
      clientId: "db-m",
      clientSecret: "db-ms",
      tenantId: "common",
    });
  });

  it("keeps the last good settings when a later read fails, and logs it", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    const findFirst = jest.mocked(prisma.systemSettings.findFirst);
    findFirst.mockResolvedValueOnce({
      githubClientId: "db-gh",
      githubClientSecret: encryptSecret("db-ghs"),
    } as never);
    await readSignInProviderConfig();
    findFirst.mockRejectedValueOnce(new Error("db down"));
    const config = await readSignInProviderConfig();
    expect(config.github).toEqual({
      clientId: "db-gh",
      clientSecret: "db-ghs",
    });
    expect(jest.mocked(logger.error)).toHaveBeenCalledWith(
      expect.stringContaining("keeping the last good"),
      expect.anything(),
      "SignInProviders"
    );
  });

  it("falls back to the environment when no read has ever worked", async () => {
    process.env.GITHUB_CLIENT_ID = "env-gh";
    process.env.GITHUB_CLIENT_SECRET = "env-ghs";
    jest
      .mocked(prisma.systemSettings.findFirst)
      .mockRejectedValueOnce(new Error("db down"));
    const config = await readSignInProviderConfig();
    expect(config.github).toEqual({
      clientId: "env-gh",
      clientSecret: "env-ghs",
    });
  });
});

describe("crossSiteCallbackCookies", () => {
  it("sends the OAuth check cookies cross-site over HTTPS only", () => {
    expect(crossSiteCallbackCookies("http://localhost:3000")).toBeUndefined();
    const cookies = crossSiteCallbackCookies("https://use.needt.app")!;
    expect(cookies.pkceCodeVerifier?.options).toMatchObject({
      sameSite: "none",
      secure: true,
      httpOnly: true,
    });
    expect(cookies.state?.name).toBe("__Secure-next-auth.state");
    // the return address keeps NextAuth's SameSite=Lax default
    expect(cookies).not.toHaveProperty("callbackUrl");
    expect(cookies).not.toHaveProperty("sessionToken");
    expect(cookies).not.toHaveProperty("csrfToken");
  });
});
