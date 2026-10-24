import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("CI security workflow", () => {
  it("scans only findings added after the actual main merge base", () => {
    expect(workflow).toContain(
      "git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main"
    );
    expect(workflow).toContain("BASE_SHA=$(git merge-base origin/main HEAD)");
    expect(workflow).toContain(
      'semgrep --config=auto --error --baseline-commit "$BASE_SHA"'
    );
    expect(workflow).not.toContain("SEMGREP_BASELINE_COMMIT");
    expect(workflow).not.toContain('zero_sha="');
  });

  it("gates production dependencies and scans PR commits for secrets", () => {
    expect(workflow).toContain("run: node scripts/check-npm-audit.mjs");
    // Third-party actions are pinned to a commit, never a moving tag.
    expect(workflow).toMatch(/uses: gitleaks\/gitleaks-action@[0-9a-f]{40} #/);
  });
});
