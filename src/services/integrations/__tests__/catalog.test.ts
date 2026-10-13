import { getIntegrationCatalog } from "../catalog";

const credentials = {
  google: { clientId: "", clientSecret: "" },
  outlook: { clientId: "", clientSecret: "", tenantId: "common" },
};
jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: async () => credentials.google,
  getOutlookCredentials: async () => credentials.outlook,
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const previousKey = process.env.COMPOSIO_API_KEY;
afterEach(() => {
  if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = previousKey;
  credentials.google = { clientId: "", clientSecret: "" };
  credentials.outlook = { clientId: "", clientSecret: "", tenantId: "common" };
});

const find = async (slug: string, admin: boolean) =>
  (await getIntegrationCatalog({ admin })).find((c) => c.slug === slug)!;

describe("the connector catalog", () => {
  it("reads Google and Microsoft from the same lookup as the OAuth routes", async () => {
    credentials.google = { clientId: "id", clientSecret: "secret" };
    credentials.outlook = {
      clientId: "id",
      clientSecret: "secret",
      tenantId: "common",
    };
    expect((await find("google-calendar", true)).configured).toBe(true);
    expect((await find("outlook-calendar", true)).configured).toBe(true);
  });

  it("is not configured with only half a client", async () => {
    credentials.google = { clientId: "id", clientSecret: "" };
    expect((await find("google-calendar", true)).configured).toBe(false);
  });

  it("needs the Composio key for every toolkit, and says so to an admin only", async () => {
    delete process.env.COMPOSIO_API_KEY;
    const admin = await find("notion", true);
    expect(admin.configured).toBe(false);
    expect(admin.requires).toBe("COMPOSIO_API_KEY in the server environment");
    expect(await find("notion", false)).not.toHaveProperty("requires");
    process.env.COMPOSIO_API_KEY = "key";
    const on = await find("notion", true);
    expect(on.configured).toBe(true);
    expect(on.requires).toBeUndefined();
  });

  it("never needs anything for Apple / iCloud", async () => {
    const icloud = await find("icloud-calendar", false);
    expect(icloud.configured).toBe(true);
  });
});
