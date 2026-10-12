import { encryptSecret as sealLegacy } from "@/services/ai/encryption";
import {
  openImportToken,
  sealImportToken,
} from "@/services/imports/token-secret";

describe("import token secrets", () => {
  const originalKey = process.env.AI_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.AI_ENCRYPTION_KEY = "import-token-test-key";
  });
  afterAll(() => {
    process.env.AI_ENCRYPTION_KEY = originalKey;
  });

  it("stores new tokens in the enc:v1 format and reads them back", () => {
    const sealed = sealImportToken("todoist-token");
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("todoist-token");
    expect(openImportToken(sealed)).toBe("todoist-token");
  });

  it("still reads a token written in the old unprefixed format", () => {
    const legacy = sealLegacy("queued-before-deploy");
    expect(legacy.startsWith("enc:v1:")).toBe(false);
    expect(openImportToken(legacy)).toBe("queued-before-deploy");
  });

  it("answers null when there is no token", () => {
    expect(openImportToken(null)).toBeNull();
    expect(openImportToken("")).toBeNull();
  });
});
