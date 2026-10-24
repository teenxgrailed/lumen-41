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
  // The task-parsing notice's last screen consumer, the pre-v3 /quick-add
  // page, is gone (/quick-add opens the v3 composer); /api/ai/parse-tasks
  // still returns `notice` for API clients.
});
