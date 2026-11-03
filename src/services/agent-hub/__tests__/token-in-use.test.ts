import type { HubAgent } from "@prisma/client";

import { assertTokenNotInUse } from "../agents";
import { HubError } from "../errors";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const agent = (extra: Partial<HubAgent> = {}) =>
  ({
    id: "a1",
    name: "Grok Bot",
    kind: "grok",
    capabilities: "browser",
    skills: ["browser"],
    ...extra,
  }) as HubAgent;

describe("one token per agent", () => {
  it("refuses a different name or kind on a registered agent", () => {
    for (const input of [{ name: "Codex" }, { kind: "codex" as const }]) {
      try {
        assertTokenNotInUse(agent(), input);
        throw new Error("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HubError);
        expect((error as HubError).code).toBe("TOKEN_IN_USE");
        expect((error as HubError).status).toBe(409);
        expect((error as HubError).message).toBe(
          "This token already belongs to agent Grok Bot. Create a separate token for each agent in Settings > Connections."
        );
      }
    }
  });

  it("keeps the same client idempotent", () => {
    expect(() =>
      assertTokenNotInUse(agent(), { name: " grok bot ", kind: "grok" })
    ).not.toThrow();
    expect(() => assertTokenNotInUse(agent(), {})).not.toThrow();
    expect(() =>
      assertTokenNotInUse(agent(), { skills: ["code"] })
    ).not.toThrow();
  });

  it("lets a fresh token claim its identity", () => {
    const fresh = agent({ kind: "other", capabilities: "", skills: [] });
    expect(() =>
      assertTokenNotInUse(fresh, { name: "Codex", kind: "codex" })
    ).not.toThrow();
  });
});
