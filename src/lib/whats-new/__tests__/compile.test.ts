import {
  MAX_ENTRIES,
  type WhatsNewFragment,
  compileWhatsNew,
  datesFromGitLog,
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
    const feed = compileWhatsNew(many, 3);
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
