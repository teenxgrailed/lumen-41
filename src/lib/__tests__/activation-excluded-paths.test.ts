import { readFileSync } from "fs";
import { join } from "path";

/**
 * task_created counts tasks a person made. These paths write tasks nobody
 * asked for at that moment (provider sync, habit occurrences, the sample and
 * first-replan demo rows), so none of them may record activation. A source
 * check keeps a later "record everywhere" sweep from adding them.
 */
const EXCLUDED = [
  "src/lib/task-sync/task-sync-manager.ts",
  "src/lib/task-sync/providers/outlook-provider.ts",
  "src/lib/task-sync/providers/google-provider.ts",
  "src/services/habits/habit-service.ts",
  "src/services/habits/evening-push.ts",
  "src/services/onboarding/first-replan-demo.ts",
  "src/lib/onboarding/first-replan.ts",
];

describe("paths that must not record task_created", () => {
  it.each(EXCLUDED)("%s does not import or call recordActivation", (file) => {
    let source: string;
    try {
      source = readFileSync(`${process.cwd()}/${file}`, "utf8");
    } catch {
      // A renamed file is caught by the list review, not by this check.
      return;
    }
    expect(source).not.toMatch(/recordActivation|activation-events/);
  });

  it("the onboarding sample plan only reads, it never records", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/onboarding/plan.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/recordActivation/);
  });
});
