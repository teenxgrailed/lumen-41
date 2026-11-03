/**
 * The pure parts of the hub graph: checklist criteria, ready-queue order, the
 * stale flag and the input shapes. The database behaviour (links, cycles,
 * claim of a blocked item, plans, next) is in agent-hub.integration.test.ts.
 */
import { zodToJsonSchema } from "@/services/connectors/mcp/json-schema";
import type { HubAgent, HubItem } from "@prisma/client";

import { STALE_AFTER_MS } from "../constants";
import { isStale, rankReady } from "../deps";
import {
  completeInput,
  createItemInput,
  editItemInput,
  inboxInput,
  linkInput,
  nextInput,
  planCreateInput,
  splitCriteria,
  updateInput,
} from "../schemas";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const agent = {
  id: "me",
  skills: ["browser", "youtube-upload"],
} as unknown as HubAgent;

function item(extra: Partial<HubItem>): HubItem {
  return {
    id: "i",
    assigneeAgentId: null,
    requiredSkills: ["browser"],
    due: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...extra,
  } as HubItem;
}

const brief = {
  title: "Record the demo",
  goal: "Record a two minute capture of the verification demo.",
  doneCriteria: "A public link",
  context: "The app is signed in on the shared browser profile. Show consent.",
  risks: [],
  assignee: "any",
  requiredSkills: ["browser"],
};

describe("splitCriteria", () => {
  it("keeps a sentence and turns a list into a checklist plus text", () => {
    expect(splitCriteria("  Link to the video ")).toEqual({
      text: "Link to the video",
      items: [],
    });
    expect(splitCriteria([" Uploaded ", "Public", ""])).toEqual({
      text: "- Uploaded\n- Public",
      items: ["Uploaded", "Public"],
    });
  });
});

describe("rankReady", () => {
  it("puts assigned work first, then the closer skill match, then due, then age", () => {
    const assignedLate = item({
      id: "assigned",
      assigneeAgentId: "me",
      due: new Date("2026-12-01T00:00:00Z"),
    });
    const broad = item({ id: "broad", requiredSkills: ["browser"] });
    const specific = item({
      id: "specific",
      requiredSkills: ["browser", "youtube-upload"],
    });
    const dueSoon = item({
      id: "dueSoon",
      requiredSkills: ["browser"],
      due: new Date("2026-11-05T00:00:00Z"),
    });
    const older = item({
      id: "older",
      requiredSkills: ["browser"],
      createdAt: new Date("2026-10-01T00:00:00Z"),
    });
    const ranked = rankReady(
      [broad, dueSoon, older, specific, assignedLate],
      agent
    );
    expect(ranked.map((row) => row.id)).toEqual([
      "assigned",
      "specific",
      "dueSoon",
      "older",
      "broad",
    ]);
  });
});

describe("isStale", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("flags a held item with no update for more than four hours", () => {
    expect(
      isStale(
        { status: "in_progress", updatedAt: ago(STALE_AFTER_MS + 1000) },
        now
      )
    ).toBe(true);
    expect(
      isStale({ status: "claimed", updatedAt: ago(STALE_AFTER_MS - 1000) }, now)
    ).toBe(false);
  });
  it("never flags an open, waiting or finished item", () => {
    const statuses = ["open", "needs_owner", "done", "failed", "cancelled"];
    for (const status of statuses) {
      const updatedAt = ago(STALE_AFTER_MS * 5);
      expect(isStale({ status, updatedAt }, now)).toBe(false);
    }
  });
});

describe("input shapes", () => {
  it("accepts done-criteria as a sentence or a checklist, and rejects an empty list", () => {
    expect(createItemInput.safeParse(brief).success).toBe(true);
    expect(
      createItemInput.safeParse({ ...brief, doneCriteria: ["a", "b"] }).success
    ).toBe(true);
    expect(
      createItemInput.safeParse({ ...brief, doneCriteria: [] }).success
    ).toBe(false);
    expect(
      editItemInput.safeParse({ id: "x", doneCriteria: ["a"] }).success
    ).toBe(true);
  });

  it("takes criteriaMet as one answer or one per entry, and usage", () => {
    const base = { id: "x", outcome: "done", result: { summary: "ok" } };
    expect(
      completeInput.safeParse({ ...base, criteriaMet: true }).success
    ).toBe(true);
    expect(
      completeInput.safeParse({
        ...base,
        criteriaMet: [true, false],
        usage: { tokens: 1200, costUsd: 0.4, minutes: 9 },
      }).success
    ).toBe(true);
    expect(
      completeInput.safeParse({ ...base, usage: { tokens: -1 } }).success
    ).toBe(false);
    expect(
      updateInput.safeParse({ id: "x", usage: { minutes: 3 } }).success
    ).toBe(true);
  });

  it("knows the ready view, link kinds and a plan of at most 20 steps", () => {
    expect(inboxInput.safeParse({ view: "ready" }).success).toBe(true);
    expect(nextInput.safeParse({ skipIds: ["a"] }).success).toBe(true);
    expect(
      linkInput.safeParse({ fromId: "a", toId: "b", kind: "blocks" }).success
    ).toBe(true);
    expect(
      linkInput.safeParse({ fromId: "a", toId: "b", kind: "follows" }).success
    ).toBe(false);
    const step = { ...brief, title: "Step" };
    expect(
      planCreateInput.safeParse({ ...brief, children: [step] }).success
    ).toBe(true);
    expect(planCreateInput.safeParse({ ...brief, children: [] }).success).toBe(
      false
    );
    expect(
      planCreateInput.safeParse({
        ...brief,
        children: Array.from({ length: 21 }, () => step),
      }).success
    ).toBe(false);
  });

  it("converts to the JSON schema the MCP tools publish", () => {
    for (const schema of [
      createItemInput,
      completeInput,
      planCreateInput,
      linkInput,
      nextInput,
    ]) {
      const json = zodToJsonSchema(schema) as {
        type?: string;
        properties?: Record<string, unknown>;
      };
      expect(json.type).toBe("object");
      expect(Object.keys(json.properties ?? {}).length).toBeGreaterThan(0);
    }
    const plan = zodToJsonSchema(planCreateInput) as {
      properties: { children: { type: string } };
    };
    expect(plan.properties.children.type).toBe("array");
  });
});
