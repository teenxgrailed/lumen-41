import {
  MAX_ENTRIES,
  type WhatsNewFragment,
  compileWhatsNew,
  datesFromGitLog,
  parseChangelog,
  parseFeed,
  parseFragment,
  plainText,
} from "../compile";

const frag = (
  name: string,
  text: string,
  date: string | null,
  at?: string
): WhatsNewFragment => ({ name, text, date, at: at ?? null });

describe("parseFragment", () => {
  it("makes one entry per bullet and joins its wrapped lines", () => {
    expect(
      parseFragment(
        "- Pages can be exported as Markdown\n  and PDF.\n- Boards can be shared.\n"
      )
    ).toEqual([
      "Pages can be exported as Markdown and PDF.",
      "Boards can be shared.",
    ]);
  });

  it("reads a fragment without bullets as one entry per paragraph", () => {
    expect(
      parseFragment(
        "Phone: the dock stands 30 px\nabove the edge.\n\nSecond one."
      )
    ).toEqual(["Phone: the dock stands 30 px above the edge.", "Second one."]);
  });

  it("skips headings, comments and blank fragments", () => {
    expect(parseFragment("# Title\n<!-- note -->\n\n- Kept\n")).toEqual([
      "Kept",
    ]);
    expect(parseFragment("\n\n")).toEqual([]);
  });

  it("handles CRLF line ends", () => {
    expect(parseFragment("- One\r\n  more\r\n- Two\r\n")).toEqual([
      "One more",
      "Two",
    ]);
  });
});

describe("plainText", () => {
  it("drops inline code, emphasis and link targets", () => {
    expect(
      plainText(
        "Run `npm run x` for **bold**, __strong__, *soft* and [the docs](https://x.y)."
      )
    ).toBe("Run npm run x for bold, strong, soft and the docs.");
  });

  it("keeps a lone asterisk that is not emphasis", () => {
    expect(plainText("Rated 5 * 3 times")).toBe("Rated 5 * 3 times");
  });
});

describe("compileWhatsNew", () => {
  const fragments = [
    frag(
      "b-board.md",
      "- Boards are shared.",
      "2026-10-20",
      "2026-10-20T09:00:00.000Z"
    ),
    frag(
      "a-pages.md",
      "- Pages export.",
      "2026-10-21",
      "2026-10-21T08:00:00.000Z"
    ),
    frag(
      "c-mail.md",
      "- Mail reads.\n- Mail tasks.",
      "2026-10-21",
      "2026-10-21T18:00:00.000Z"
    ),
    frag("d-undated.md", "- No date.", null),
    frag("README.md", "- Not an entry.", "2026-10-22"),
    frag("notes.txt", "- Not markdown.", "2026-10-22"),
    frag("chore-dead-code.md", "- Internal.", "2026-10-22"),
  ];

  it("groups by day, newest first, undated last", () => {
    const feed = compileWhatsNew(fragments);
    expect(feed.version).toBe(1);
    expect(feed.groups.map((g) => g.date)).toEqual([
      "2026-10-21",
      "2026-10-20",
      null,
    ]);
  });

  it("orders a day by commit time, newest first, and keeps bullet order", () => {
    const feed = compileWhatsNew(fragments);
    expect(feed.groups[0].entries).toEqual([
      { id: "c-mail-1", text: "Mail reads." },
      { id: "c-mail-2", text: "Mail tasks." },
      { id: "a-pages-1", text: "Pages export." },
    ]);
  });

  it("is deterministic whatever order the files are read in", () => {
    const a = JSON.stringify(compileWhatsNew(fragments));
    const b = JSON.stringify(compileWhatsNew([...fragments].reverse()));
    expect(b).toBe(a);
  });

  it("orders same-time fragments by name", () => {
    const feed = compileWhatsNew([
      frag("z.md", "- Z", "2026-10-01"),
      frag("m.md", "- M", "2026-10-01"),
    ]);
    expect(feed.groups[0].entries.map((e) => e.id)).toEqual(["m-1", "z-1"]);
  });

  it("treats a malformed date as undated", () => {
    const feed = compileWhatsNew([frag("x.md", "- X", "21.10.2026")]);
    expect(feed.groups).toEqual([
      { date: null, entries: [{ id: "x-1", text: "X" }] },
    ]);
  });

  it("caps the feed at the newest entries", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      frag(`f${i}.md`, "- one\n- two", `2026-10-0${i + 1}`)
    );
    const feed = compileWhatsNew(many, { maxEntries: 3 });
    expect(feed.groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual([
      "f4-1",
      "f4-2",
      "f3-1",
    ]);
    expect(MAX_ENTRIES).toBeGreaterThan(0);
  });

  it("returns an empty feed for no fragments", () => {
    expect(compileWhatsNew([])).toEqual({ version: 1, groups: [] });
  });
});

// What `npm run changelog:collect` writes, after the heading is renamed.
const CHANGELOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "- Not released yet.",
  "",
  "## [1.0.1] — 2026-10-27",
  "",
  "<!-- changelog.d/hotfix.md -->",
  "- Sync recovers.",
  "<!-- /changelog.d -->",
  "",
  "## [1.0.0] — 2026-10-25",
  "",
  "<!-- changelog.d/app-icon-picker.md -->",
  "- Pick an app icon.",
  "<!-- changelog.d/chore-dead-code.md -->",
  "- Dead code removed.",
  "<!-- changelog.d/pages.md -->",
  "- Pages export as",
  "  Markdown.",
  "- Pages print.",
  "<!-- /changelog.d -->",
  "",
  "- Hand-written `bullet`.",
  "",
  "### Fixed",
  "",
  "- A fix.",
  "",
  "## [1.0.0-beta] 2026-09-30",
  "",
  "- Too old.",
  "",
  "## [1.3.0] 2025-03-25",
  "",
  "- FluidCalendar.",
  "",
  "## [1.2.3]",
  "",
  "- Undated.",
  "",
].join("\n");

describe("parseChangelog", () => {
  it("reads dated releases from the floor on, newest first, by marker", () => {
    expect(parseChangelog(CHANGELOG)).toEqual([
      {
        version: "1.0.1",
        date: "2026-10-27",
        parts: [{ name: "hotfix.md", text: "- Sync recovers." }],
      },
      {
        version: "1.0.0",
        date: "2026-10-25",
        parts: [
          { name: "app-icon-picker.md", text: "- Pick an app icon." },
          { name: "chore-dead-code.md", text: "- Dead code removed." },
          {
            name: "pages.md",
            text: "- Pages export as\n  Markdown.\n- Pages print.",
          },
          {
            name: null,
            text: "\n- Hand-written `bullet`.\n\n### Fixed\n\n- A fix.\n",
          },
        ],
      },
    ]);
  });

  it("accepts an en dash, a hyphen or no separator before the date", () => {
    const read = (h: string) =>
      parseChangelog(`${h}\n\n- X\n`).map((r) => [r.version, r.date]);
    expect(read("## [1.1.0] – 2026-11-02")).toEqual([["1.1.0", "2026-11-02"]]);
    expect(read("## [1.1.0] - 2026-11-02")).toEqual([["1.1.0", "2026-11-02"]]);
    expect(read("## [1.1.0] 2026-11-02")).toEqual([["1.1.0", "2026-11-02"]]);
    expect(read("## [1.1.0]")).toEqual([]);
  });

  it("is empty without released sections", () => {
    expect(parseChangelog("# Changelog\n\n## [Unreleased]\n\n- A\n")).toEqual(
      []
    );
    expect(parseChangelog("")).toEqual([]);
  });
});

describe("compileWhatsNew with releases", () => {
  const releases = parseChangelog(CHANGELOG);

  it("shows the last releases when changelog.d is empty", () => {
    expect(compileWhatsNew([], { releases })).toEqual({
      version: 1,
      groups: [
        {
          date: "2026-10-27",
          entries: [{ id: "hotfix-1", text: "Sync recovers." }],
        },
        {
          date: "2026-10-25",
          entries: [
            { id: "app-icon-picker-1", text: "Pick an app icon." },
            { id: "pages-1", text: "Pages export as Markdown." },
            { id: "pages-2", text: "Pages print." },
            { id: "v1.0.0-1", text: "Hand-written bullet." },
            { id: "v1.0.0-2", text: "A fix." },
          ],
        },
      ],
    });
  });

  it("lists new fragments first and a shared text once", () => {
    const feed = compileWhatsNew(
      [
        frag("later.md", "- Later.", "2026-10-25", "2026-10-25T20:00:00Z"),
        frag("again.md", "- Pages print.", "2026-10-28"),
        frag("hotfix.md", "- Same name, new text.", "2026-10-28"),
      ],
      { releases }
    );
    const ids = feed.groups.map((g) => [g.date, g.entries.map((e) => e.id)]);
    expect(ids).toEqual([
      ["2026-10-28", ["again-1", "hotfix-1"]],
      ["2026-10-27", ["v1.0.1-hotfix-1"]],
      [
        "2026-10-25",
        ["later-1", "app-icon-picker-1", "pages-1", "v1.0.0-1", "v1.0.0-2"],
      ],
    ]);
  });

  it("orders a release by when its fragments were added, newest first", () => {
    const feed = compileWhatsNew([], {
      releases: [
        {
          version: "1.0.0",
          date: "2026-10-25",
          parts: [
            { name: null, text: "- Loose." },
            { name: "a.md", text: "- A", at: "2026-10-10T00:00:00.000Z" },
            { name: "b.md", text: "- B" },
            { name: "c.md", text: "- C", at: "2026-10-20T00:00:00.000Z" },
          ],
        },
      ],
    });
    expect(feed.groups[0].entries.map((e) => e.id)).toEqual([
      "c-1",
      "a-1",
      "v1.0.0-1",
      "b-1",
    ]);
  });

  it("caps fragments and releases together", () => {
    const feed = compileWhatsNew([frag("a.md", "- A", "2026-10-30")], {
      releases,
      maxEntries: 3,
    });
    expect(feed.groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual([
      "a-1",
      "hotfix-1",
      "app-icon-picker-1",
    ]);
  });
});

describe("datesFromGitLog", () => {
  const log = [
    "",
    "2026-10-21T20:15:00+02:00\n\nchangelog.d/new.md\nchangelog.d/sub/skip.md\nsrc/x.ts\n",
    "2026-10-19T09:00:00Z\n\nchangelog.d/new.md\nchangelog.d/old.md\n",
  ].join("\0");

  it("dates each fragment by its newest add, in UTC", () => {
    const dates = datesFromGitLog(log);
    expect(dates.get("new.md")).toEqual({
      date: "2026-10-21",
      at: "2026-10-21T18:15:00.000Z",
    });
    expect(dates.get("old.md")?.date).toBe("2026-10-19");
    expect(dates.has("sub/skip.md")).toBe(false);
    expect(dates.size).toBe(2);
  });

  it("ignores an empty or broken log", () => {
    expect(datesFromGitLog("").size).toBe(0);
    expect(datesFromGitLog("\0not a date\nchangelog.d/a.md\n").size).toBe(0);
  });
});

describe("parseFeed", () => {
  it("keeps valid groups and entries only", () => {
    expect(
      parseFeed({
        version: 1,
        groups: [
          {
            date: "2026-10-21",
            entries: [{ id: "a", text: "A", extra: 1 }, { id: 2 }],
          },
          { date: "bad", entries: [{ id: "b", text: "B" }] },
          { date: "2026-10-20", entries: [] },
          null,
        ],
      })
    ).toEqual({
      version: 1,
      groups: [
        { date: "2026-10-21", entries: [{ id: "a", text: "A" }] },
        { date: null, entries: [{ id: "b", text: "B" }] },
      ],
    });
  });

  it("reads anything else as the empty feed", () => {
    expect(parseFeed(null).groups).toEqual([]);
    expect(parseFeed({ groups: "x" }).groups).toEqual([]);
  });
});
