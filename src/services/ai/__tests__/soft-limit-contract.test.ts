import { readFileSync } from "fs";
import { join } from "path";

import {
  HOSTED_AI_BUSY_MESSAGE,
  HOSTED_AI_RESTING_MESSAGE,
} from "../slow-queue";

describe("hosted AI soft-limit UI contract", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/ai/AIChatSurface.tsx"),
    "utf8"
  );
  const normalizedSource = source.replace(/\s+/g, " ");

  it("keeps the no-number busy and resting messages in chat", () => {
    expect(normalizedSource).toContain(HOSTED_AI_BUSY_MESSAGE);
    expect(normalizedSource).toContain(HOSTED_AI_RESTING_MESSAGE);
  });

  it("does not render hosted allowance counts in chat", () => {
    expect(source).not.toMatch(/actions left|remaining\}\s*\/\s*\{.*limit/i);
  });

  it("surfaces task-parsing notices in every visible consumer", () => {
    // SmartPlanningPanel and the old AI settings page were this notice's other
    // consumers; both are gone, so quick-add is the one surface left to check.
    for (const path of [
      "src/app/(app)/quick-add/page.tsx",
    ]) {
      const consumer = readFileSync(join(process.cwd(), path), "utf8");
      expect(consumer).toContain("data.notice");
      expect(consumer).toContain('dedupeKey: "hosted-ai-status"');
    }
  });
});
