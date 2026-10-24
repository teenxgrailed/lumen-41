import { parseChangelog } from "@/lib/whats-new/compile";

import {
  areaOf,
  cutRelease,
  hasRelease,
  isDay,
  isVersion,
  parseSection,
  releaseHeading,
  releaseNotes,
  setJsonVersion,
  setPbxprojMarketingVersion,
  setXcodegenMarketingVersion,
  summarise,
} from "../release.cjs";

const HEAD = ["# Changelog", "", "Intro.", "", "## [Unreleased]", ""].join(
  "\n"
);

const COLLECTED = [
  "<!-- changelog.d/app-icon-picker.md -->",
  "- Settings: pick one of twelve app icons.",
  "<!-- changelog.d/chore-dead-code.md -->",
  "- Removed dead code.",
  "<!-- changelog.d/habits-history.md -->",
  "- Habits show a year of history,",
  "  one square per day.",
  "<!-- /changelog.d -->",
  "",
  "- Older hand-written line.",
  "",
  "### Fixed",
  "",
  "- An older fix.",
].join("\n");

const OLD = "\n\n## [1.3.0] 2025-03-25\n\n- Upstream entry.\n";

describe("isVersion / isDay", () => {
  it("accepts only X.Y.Z", () => {
    expect(isVersion("1.0.0")).toBe(true);
    expect(isVersion("10.20.30")).toBe(true);
    for (const v of ["1.0", "v1.0.0", "1.0.0-rc.1", "01.0.0", "1.0.0 ", ""]) {
      expect(isVersion(v)).toBe(false);
    }
  });

  it("accepts only real calendar days", () => {
    expect(isDay("2026-10-25")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    for (const d of ["2026-02-30", "2026-13-01", "26-10-25", "2026-10-25T00"]) {
      expect(isDay(d)).toBe(false);
    }
  });
});

describe("cutRelease", () => {
  const md = HEAD + COLLECTED + OLD;

  it("renames Unreleased to the dated heading and opens a fresh one above", () => {
    const { changelog, section } = cutRelease(md, "1.0.0", "2026-10-25");
    expect(releaseHeading("1.0.0", "2026-10-25")).toBe(
      "## [1.0.0] — 2026-10-25"
    );
    expect(changelog).toBe(
      HEAD + "\n## [1.0.0] — 2026-10-25\n\n" + COLLECTED + OLD
    );
    expect(changelog).toContain(
      "## [Unreleased]\n\n## [1.0.0] — 2026-10-25\n\n<!-- changelog.d/app-icon-picker.md -->"
    );
    expect(section).toBe(COLLECTED);
  });

  it("keeps the collector markers, so What's new reads the release", () => {
    const { changelog } = cutRelease(md, "1.0.0", "2026-10-25");
    const [release, ...rest] = parseChangelog(changelog);
    expect(rest).toEqual([]);
    expect(release.version).toBe("1.0.0");
    expect(release.date).toBe("2026-10-25");
    expect(release.parts.map((p) => p.name)).toEqual([
      "app-icon-picker.md",
      "chore-dead-code.md",
      "habits-history.md",
      null,
    ]);
  });

  it("works when Unreleased is the last section", () => {
    const { changelog } = cutRelease(HEAD + "- Only.\n", "0.2.0", "2026-11-01");
    expect(changelog).toBe(HEAD + "\n## [0.2.0] — 2026-11-01\n\n- Only.\n");
  });

  it("refuses a duplicate version, an empty section and bad input", () => {
    const released = cutRelease(md, "1.0.0", "2026-10-25").changelog;
    expect(hasRelease(released, "1.0.0")).toBe(true);
    expect(hasRelease(released, "1.0.1")).toBe(false);
    expect(() => cutRelease(released + "", "1.0.0", "2026-10-26")).toThrow(
      /already has a \[1\.0\.0\]/
    );
    // After a cut the fresh Unreleased section is empty.
    expect(() => cutRelease(released, "1.0.1", "2026-10-26")).toThrow(
      /no entries/
    );
    expect(() => cutRelease("# Changelog\n", "1.0.0", "2026-10-25")).toThrow(
      /no '## \[Unreleased\]'/
    );
    expect(() => cutRelease(md, "1.0", "2026-10-25")).toThrow(/X\.Y\.Z/);
    expect(() => cutRelease(md, "1.0.0", "25.10.2026")).toThrow(/YYYY-MM-DD/);
  });
});

describe("setJsonVersion", () => {
  const pkg = `${JSON.stringify(
    { name: "needt", version: "0.1.0", scripts: { dev: "next dev" } },
    null,
    2
  )}\n`;
  const lock = `${JSON.stringify(
    {
      name: "needt",
      version: "0.1.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "needt", version: "0.1.0" },
        "node_modules/a": { version: "0.1.0" },
      },
    },
    null,
    2
  )}\n`;

  it("changes only the top-level version of package.json", () => {
    const out = setJsonVersion(pkg, "1.0.0");
    expect(out).toBe(pkg.replace('"version": "0.1.0"', '"version": "1.0.0"'));
  });

  it("changes the lockfile's two root versions and no dependency", () => {
    const out = JSON.parse(setJsonVersion(lock, "1.0.0", { lockfile: true }));
    expect(out.version).toBe("1.0.0");
    expect(out.packages[""].version).toBe("1.0.0");
    expect(out.packages["node_modules/a"].version).toBe("0.1.0");
  });

  it("refuses a file not in npm's layout and a bad version", () => {
    expect(() => setJsonVersion('{"version":"0.1.0"}', "1.0.0")).toThrow(
      /layout/
    );
    expect(() => setJsonVersion(pkg, "1.0")).toThrow(/X\.Y\.Z/);
    expect(() => setJsonVersion(pkg, "1.0.0", { lockfile: true })).toThrow(
      /packages/
    );
  });
});

describe("Xcode marketing versions", () => {
  it("bumps MARKETING_VERSION in project.yml and leaves the build number", () => {
    const yml = [
      "settings:",
      "  base:",
      '    MARKETING_VERSION: "0.1.0"',
      '    CURRENT_PROJECT_VERSION: "1"',
      "        CFBundleShortVersionString: $(MARKETING_VERSION)",
    ].join("\n");
    expect(setXcodegenMarketingVersion(yml, "1.0.0")).toBe(
      yml.replace('MARKETING_VERSION: "0.1.0"', 'MARKETING_VERSION: "1.0.0"')
    );
    expect(() => setXcodegenMarketingVersion("name: x\n", "1.0.0")).toThrow(
      /No MARKETING_VERSION/
    );
  });

  it("bumps every MARKETING_VERSION in project.pbxproj", () => {
    const pbx = [
      "\t\t\t\tCURRENT_PROJECT_VERSION = 1;",
      "\t\t\t\tMARKETING_VERSION = 1.0;",
      "\t\t\t\tMARKETING_VERSION = 1.0;",
    ].join("\n");
    expect(setPbxprojMarketingVersion(pbx, "1.0.0")).toBe(
      [
        "\t\t\t\tCURRENT_PROJECT_VERSION = 1;",
        "\t\t\t\tMARKETING_VERSION = 1.0.0;",
        "\t\t\t\tMARKETING_VERSION = 1.0.0;",
      ].join("\n")
    );
  });
});

describe("release notes", () => {
  it("parses fragments and the hand-written rest", () => {
    expect(parseSection(COLLECTED)).toEqual([
      {
        name: "app-icon-picker.md",
        bullets: ["Settings: pick one of twelve app icons."],
      },
      { name: "chore-dead-code.md", bullets: ["Removed dead code."] },
      {
        name: "habits-history.md",
        bullets: ["Habits show a year of history, one square per day."],
      },
      { name: null, bullets: ["Older hand-written line.", "An older fix."] },
    ]);
  });

  it("groups by area from the label, then the fragment name", () => {
    expect(areaOf("x.md", "Mac app: widgets on the desktop.")).toBe("Mac app");
    expect(areaOf("feat-habits-history.md", "A year of squares.")).toBe(
      "Habits"
    );
    expect(areaOf("misc.md", "Something nobody can place.")).toBe("Other");
  });

  it("summarises to the first sentence without the label", () => {
    expect(summarise("Settings: pick an icon. It sticks.")).toBe(
      "Pick an icon"
    );
    expect(summarise("x ".repeat(100)).length).toBeLessThanOrEqual(110);
  });

  it("writes grouped, bounded notes and leaves chores out", () => {
    const notes = releaseNotes({
      version: "1.0.0",
      date: "2026-10-25",
      section: COLLECTED,
    });
    expect(notes).toBe(
      [
        "# Needt 1.0.0 — 2026-10-25",
        "",
        "2 user-facing changes from 2 changelog fragments, grouped by area. The full list is in CHANGELOG.md under [1.0.0].",
        "",
        "CHANGELOG.md also carries 2 hand-written entries from before fragments existed; they are not summarised here. 1 internal housekeeping entry is left out.",
        "",
        "## Habits (1)",
        "- Habits show a year of history, one square per day",
        "",
        "## Settings, admin and help (1)",
        "- Pick one of twelve app icons",
        "",
      ].join("\n")
    );
  });

  it("keeps every area and never exceeds the line budget", () => {
    const labels = ["Mac app", "iPhone", "Home", "Habits", "Focus", "Misc"];
    const many = Array.from(
      { length: 200 },
      (_, i) =>
        `<!-- changelog.d/f${i}.md -->\n- ${labels[i % labels.length]}: change ${i}.`
    ).join("\n");
    const notes = releaseNotes({
      version: "1.0.0",
      date: "2026-10-25",
      section: many,
      maxLines: 60,
    });
    const lines = notes.trimEnd().split("\n");
    expect(lines.length).toBe(60);
    expect(lines.filter((l) => l.startsWith("## "))).toEqual([
      "## Mac app (34)",
      "## iPhone app (34)",
      "## Home (33)",
      "## Focus (33)",
      "## Habits (33)",
      "## Other (33)",
    ]);
    // Areas of equal size get an equal share of the spare lines.
    const perArea = notes
      .split("\n## ")
      .slice(1)
      .map(
        (block) => block.split("\n").filter((l) => l.startsWith("- ")).length
      );
    expect(Math.max(...perArea) - Math.min(...perArea)).toBeLessThanOrEqual(1);
  });
});
