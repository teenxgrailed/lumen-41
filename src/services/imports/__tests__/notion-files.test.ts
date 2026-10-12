import {
  NOTION_S3_BUCKET_HOSTS,
  isNotionHost,
  isNotionHostedUrl,
} from "../notion/hosts";
import { mimeOf, runNotionImport } from "../notion/importer";
import type { NotionMarkdown, NotionPage, NotionSource } from "../notion/types";
import { SafeFetchError, safeDownload } from "../safe-fetch";
import type { ImportLimitGuard } from "../types";
import { createMemoryDb } from "./memory-store";

jest.mock("../safe-fetch", () => ({
  ...jest.requireActual("../safe-fetch"),
  safeDownload: jest.fn(),
}));

describe("isNotionHost", () => {
  it.each([
    "notion.so",
    "www.notion.so",
    "file.notion.so",
    "notion-static.com",
    "s3.notion-static.com",
    "notionusercontent.com",
    "file.notionusercontent.com",
    "FILE.Notion.SO",
    "prod-files-secure.s3.us-west-2.amazonaws.com",
  ])("accepts %s", (host) => {
    expect(isNotionHost(host)).toBe(true);
  });

  it.each([
    "evilnotion-static.com",
    "evilnotion.so",
    "notion.so.evil.com",
    "notion-static.com.evil.com",
    "notionusercontent.com.evil.example",
    "evil.com",
    "xnotionusercontent.com",
    // Somebody else's S3 bucket, or the shared S3 endpoint.
    "random-bucket.s3.us-west-2.amazonaws.com",
    "evil.s3.amazonaws.com",
    "s3.us-west-2.amazonaws.com",
    "prod-files-secure.s3.us-west-2.amazonaws.com.evil.com",
    "evil-prod-files-secure.s3.us-west-2.amazonaws.com",
    "x.prod-files-secure.s3.us-west-2.amazonaws.com",
    "ec2-1-2-3-4.compute-1.amazonaws.com",
    "",
  ])("refuses %s", (host) => {
    expect(isNotionHost(host)).toBe(false);
  });

  it("names Notion's own buckets in one place", () => {
    expect(NOTION_S3_BUCKET_HOSTS).toContain(
      "prod-files-secure.s3.us-west-2.amazonaws.com"
    );
  });
});

describe("isNotionHostedUrl", () => {
  it("needs https, a Notion host, and a signature on a bucket", () => {
    const bucket =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b.png";
    expect(isNotionHostedUrl(`${bucket}?X-Amz-Signature=1`)).toBe(true);
    expect(isNotionHostedUrl(bucket)).toBe(false);
    expect(isNotionHostedUrl("https://www.notion.so/image/x.png")).toBe(true);
    expect(isNotionHostedUrl("http://www.notion.so/image/x.png")).toBe(false);
    expect(
      isNotionHostedUrl(
        "https://random.s3.us-west-2.amazonaws.com/a.png?X-Amz-Signature=1"
      )
    ).toBe(false);
    expect(
      isNotionHostedUrl("https://evilnotion-static.com/a.png?X-Amz-Signature=1")
    ).toBe(false);
    expect(isNotionHostedUrl("https://notion.so.evil.com/a.png")).toBe(false);
    expect(isNotionHostedUrl("not a url")).toBe(false);
  });
});

describe("mimeOf", () => {
  it.each([
    ["a.png", "image/png"],
    ["a.jpg", "image/jpeg"],
    ["a.gif", "image/gif"],
    ["a.webp", "image/webp"],
    ["a.pdf", "application/pdf"],
    ["a.mp3", "audio/mpeg"],
    ["a.mp4", "video/mp4"],
    ["a.mov", "video/quicktime"],
    ["a.txt", "text/plain"],
    ["a.csv", "text/csv"],
  ])("keeps the type of %s", (name, type) => {
    expect(mimeOf(name, type)).toBe(type);
    expect(mimeOf(name, `${type}; charset=utf-8`)).toBe(type);
    expect(mimeOf(name, "application/octet-stream")).toBe(type);
    expect(mimeOf(name, null)).toBe(type);
  });

  it("stores audio/mp4 as declared", () => {
    expect(mimeOf("a.m4a", "audio/mp4")).toBe("audio/mp4");
  });

  it.each([
    ["a.svg", "image/svg+xml"],
    ["a.svg", "application/octet-stream"],
    ["a.svg", null],
    ["a.png", "image/svg+xml"],
    ["page.html", "text/html"],
    ["page.png", "text/html; charset=utf-8"],
    ["a.js", "application/javascript"],
    ["a.xml", "text/xml"],
    ["a.zip", "application/zip"],
    ["a.unknown", null],
  ])("stores %s (%s) as application/octet-stream", (name, header) => {
    expect(mimeOf(name, header)).toBe("application/octet-stream");
  });
});

/* ---------- through the importer ---------- */

const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const allowAll: ImportLimitGuard = {
  allowCreate: async () => ({ allowed: true }),
};
const SIGNED = "?X-Amz-Signature=abc&X-Amz-Expires=3600";

function sourceWithMarkdown(markdown: string): NotionSource {
  const page: NotionPage = {
    object: "page",
    id: PAGE_ID,
    last_edited_time: "2026-10-01T10:00:00.000Z",
    parent: { type: "workspace", workspace: true },
    properties: {
      title: { id: "title", type: "title", title: [{ plain_text: "Page" }] },
    },
  };
  const list = (results: unknown[]) => ({
    object: "list" as const,
    results,
    has_more: false,
    next_cursor: null,
  });
  return {
    search: async (kind) => list(kind === "page" ? [page] : []),
    queryDataSource: async () => list([]),
    getPageMarkdown: async (): Promise<NotionMarkdown> => ({ markdown }),
    getBlock: async () => {
      throw new Error("no block");
    },
  };
}

describe("Notion files in the importer", () => {
  beforeEach(() => jest.mocked(safeDownload).mockReset());

  it("downloads only from Notion hosts, and tells safeDownload to refuse any other host on every hop", async () => {
    jest.mocked(safeDownload).mockResolvedValue({
      bytes: Buffer.from("x"),
      contentType: "image/png",
      finalUrl: "https://www.notion.so/a.png",
    });
    const db = createMemoryDb();
    const own = `https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/a.png${SIGNED}`;
    await runNotionImport({
      source: sourceWithMarkdown(`![mine](${own})`),
      store: db.notionStoreFor("ws-1"),
      guard: allowAll,
    });
    expect(safeDownload).toHaveBeenCalledTimes(1);
    const [url, options] = jest.mocked(safeDownload).mock.calls[0];
    expect(url).toBe(own);
    const allowHost = options.allowHost;
    expect(allowHost).toBeDefined();
    expect(allowHost?.("file.notion.so")).toBe(true);
    // A redirect hop to a public host that is not Notion's is refused.
    expect(allowHost?.("evilnotion-static.com")).toBe(false);
    expect(allowHost?.("notion.so.evil.com")).toBe(false);
    expect(allowHost?.("random-bucket.s3.us-west-2.amazonaws.com")).toBe(false);
  });

  it.each([
    `https://evilnotion-static.com/a.png${SIGNED}`,
    `https://notion.so.evil.com/a.png${SIGNED}`,
    `https://random-bucket.s3.us-west-2.amazonaws.com/a.png${SIGNED}`,
  ])("does not download %s and keeps it as a link", async (url) => {
    const db = createMemoryDb();
    await runNotionImport({
      source: sourceWithMarkdown(`![theirs](${url})`),
      store: db.notionStoreFor("ws-1"),
      guard: allowAll,
    });
    expect(safeDownload).not.toHaveBeenCalled();
    expect(db.assets.size).toBe(0);
    const page = [...db.pages.values()][0];
    expect(JSON.stringify(page.blocks)).toContain("a.png");
  });

  it("stores a downloaded svg and an html file as application/octet-stream", async () => {
    const db = createMemoryDb();
    jest
      .mocked(safeDownload)
      .mockResolvedValueOnce({
        bytes: Buffer.from("<svg onload=alert(1)/>"),
        contentType: "image/svg+xml",
        finalUrl: "https://www.notion.so/a.svg",
      })
      .mockResolvedValueOnce({
        bytes: Buffer.from("<script>alert(1)</script>"),
        contentType: "text/html",
        finalUrl: "https://www.notion.so/b.html",
      });
    await runNotionImport({
      source: sourceWithMarkdown(
        [
          `![vector](https://www.notion.so/files/a.svg${SIGNED})`,
          `<file src="https://www.notion.so/files/b.html${SIGNED}">page</file>`,
        ].join("\n\n")
      ),
      store: db.notionStoreFor("ws-1"),
      guard: allowAll,
    });
    expect(safeDownload).toHaveBeenCalledTimes(2);
    expect([...db.assets.values()].map((a) => a.mimeType)).toEqual([
      "application/octet-stream",
      "application/octet-stream",
    ]);
  });

  it("keeps the link and notes the failure when a redirect is refused", async () => {
    jest
      .mocked(safeDownload)
      .mockRejectedValue(new SafeFetchError("blocked_url", "not allowed"));
    const db = createMemoryDb();
    const url = `https://www.notion.so/files/a.png${SIGNED}`;
    const { warnings } = await runNotionImport({
      source: sourceWithMarkdown(`![x](${url})`),
      store: db.notionStoreFor("ws-1"),
      guard: allowAll,
    });
    expect(db.assets.size).toBe(0);
    expect(warnings.map((w) => w.code)).toContain("asset_failed");
  });
});

describe("Notion import heartbeat call sites", () => {
  beforeEach(() => {
    jest.mocked(safeDownload).mockReset();
    jest.mocked(safeDownload).mockResolvedValue({
      bytes: Buffer.from("x"),
      contentType: "image/png",
      finalUrl: "https://www.notion.so/a.png",
    });
  });

  async function beats(markdown: string) {
    const onHeartbeat = jest.fn().mockResolvedValue(undefined);
    await runNotionImport({
      source: sourceWithMarkdown(markdown),
      store: createMemoryDb().notionStoreFor("ws-1"),
      guard: allowAll,
      hooks: { onHeartbeat },
    });
    return onHeartbeat.mock.calls.length;
  }

  it("beats from paging discovery and from building the tree", async () => {
    // Two searches (pages, data sources) plus one tree node.
    expect(await beats("plain text")).toBe(3);
  });

  it("beats once more for every file it handles", async () => {
    const file = (name: string) =>
      `![${name}](https://www.notion.so/files/${name}.png${SIGNED})`;
    expect(await beats([file("a"), file("b")].join("\n\n"))).toBe(5);
  });
});
