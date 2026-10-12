import { NotionApiError } from "../notion/client";
import { runNotionImport } from "../notion/importer";
import type { NotionSource } from "../notion/types";
import { SafeFetchError } from "../safe-fetch";
import { ImportCancelledError, type ImportLimitGuard } from "../types";
import {
  ID,
  SIGNED_IMAGE,
  fakeNotion,
  roadmapPage,
  rowA,
  world,
} from "./fixtures/notion/workspace";
import { createMemoryDb } from "./memory-store";

const allowAll: ImportLimitGuard = {
  allowCreate: async () => ({ allowed: true }),
};

function downloader(sizeOf: (url: string) => number = () => 4) {
  const calls: string[] = [];
  const download = jest.fn(async (url: string, maxBytes: number) => {
    calls.push(url);
    const size = sizeOf(url);
    if (size > maxBytes) throw new SafeFetchError("too_large", "too big");
    return {
      bytes: Buffer.alloc(size, 1),
      contentType: url.includes(".png") ? "image/png" : "application/pdf",
      finalUrl: url,
    };
  });
  return { download, calls };
}

type Db = ReturnType<typeof createMemoryDb>;

function setup(
  options: { workspaceId?: string; db?: Db; source?: NotionSource } = {}
) {
  const db = options.db ?? createMemoryDb();
  const store = db.notionStoreFor(options.workspaceId ?? "ws-1");
  const notion = fakeNotion();
  return { db, store, notion, source: options.source ?? notion };
}

const pageByTitle = (db: Db, title: string, workspaceId = "ws-1") =>
  [...db.pages.entries()].find(
    ([, p]) => p.title === title && p.workspaceId === workspaceId
  );
const localId = (db: Db, title: string, workspaceId?: string) => {
  const found = pageByTitle(db, title, workspaceId);
  if (!found) throw new Error(`no page ${title}`);
  return found[0];
};
const nodeData = (block: { content: unknown }) => {
  const node = (
    block.content as { json: { attrs?: { kind?: string; data?: string } } }
  ).json;
  return {
    kind: node.attrs?.kind,
    data: node.attrs?.data ? JSON.parse(node.attrs.data) : null,
  };
};
const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);

describe("Notion import", () => {
  it("builds the tree parents first, with databases, rows, covers and icons", async () => {
    const { db, store, source } = setup();
    const { download } = downloader();
    const { counts } = await runNotionImport({
      source,
      store,
      guard: allowAll,
      download,
    });

    // Projects, Roadmap, Orphan, Inside a column, the database page and two rows.
    expect(db.pages.size).toBe(7);
    expect(counts).toEqual({ total: 7, done: 7, skipped: 0, failed: 0 });
    expect(
      [...db.pages.values()].every(
        (p) => p.isPrivate && p.workspaceId === "ws-1"
      )
    ).toBe(true);

    const projects = localId(db, "Projects");
    expect(db.pages.get(projects)).toMatchObject({
      parentId: null,
      icon: "🚀",
      coverUrl: "https://images.example.com/cover.jpg",
    });
    expect(db.pages.get(localId(db, "Roadmap"))?.parentId).toBe(projects);
    // Shared page whose parent was not shared becomes a root.
    expect(db.pages.get(localId(db, "Orphan"))?.parentId).toBeNull();
    // A page inside a column block: found through the block's parents.
    expect(db.pages.get(localId(db, "Inside a column"))?.parentId).toBe(
      projects
    );
    const dbPage = localId(db, "Tasks DB");
    expect(db.pages.get(dbPage)).toMatchObject({
      parentId: projects,
      icon: "✅",
    });
    for (const row of ["Fix login", "Write docs"]) {
      expect(db.pages.get(localId(db, row))?.parentId).toBe(dbPage);
    }
    // The trashed page is not imported and rows are not imported twice.
    expect(pageByTitle(db, "Trashed")).toBeUndefined();
    expect(
      [...db.pages.values()].filter((p) => p.title === "Fix login")
    ).toHaveLength(1);
    expect(db.records.size).toBe(2);
    // Siblings keep Notion's order.
    const positions = [...db.pages.values()]
      .filter((p) => p.parentId === dbPage)
      .map((p) => p.position);
    expect(positions).toEqual([1024, 2048]);
  });

  it("writes database properties and the values of a row, as text snapshots where needed", async () => {
    const { db, store, source } = setup();
    const { download } = downloader();
    const { warnings } = await runNotionImport({
      source,
      store,
      guard: allowAll,
      download,
    });

    const [database] = [...db.databases.values()];
    const props = Object.fromEntries(
      [...database.properties.values()].map((p) => [p.name, p])
    );
    expect(Object.keys(props)).toHaveLength(21);
    expect(props.Owner.type).toBe("TEXT");
    expect(props.Kind.config).toEqual({ options: ["Bug", "Chore"] });

    const record = db.records.get(localId(db, "Fix login"));
    const valueOf = (name: string) => record?.values.get(props[name].id);
    expect(valueOf("Name")).toBe("Fix login");
    expect(valueOf("Qty")).toBe(3);
    expect(valueOf("Tags")).toEqual(["x", "y"]);
    expect(valueOf("Owner")).toBe("Ada, Grace");
    expect(valueOf("Parent")).toBe("Roadmap");
    expect(valueOf("ID")).toBe("TASK-7");
    // The hosted file became an asset on the row's page; the external one stayed a link.
    const files = valueOf("Attachments") as { name: string; url: string }[];
    expect(files[0].url).toMatch(/^\/api\/pages\/.+\/assets\/.+/);
    expect(files[1]).toEqual({
      name: "ext.png",
      url: "https://images.example.com/e.png",
    });

    const flattened = warnings.find((w) => w.code === "properties_flattened");
    expect(flattened?.message).toContain("people (Owner)");
    expect(flattened?.message).toContain("button, not imported (Go)");
  });

  it("resolves links between pages after every page exists, and downloads files while fetching", async () => {
    const { db, store, source } = setup();
    const { download, calls } = downloader();
    const { warnings } = await runNotionImport({
      source,
      store,
      guard: allowAll,
      download,
    });

    // Page references on the first page (written before Roadmap's body) point at local ids.
    const projectsBlocks =
      db.pages.get(localId(db, "Projects"))?.blocks.map(nodeData) ?? [];
    expect(projectsBlocks[0].kind).toBe("PAGE_MENTION");
    expect(projectsBlocks[0].data).toMatchObject({
      pageId: localId(db, "Roadmap"),
      url: `/pages/${localId(db, "Roadmap")}`,
    });
    expect(projectsBlocks[1].data).toMatchObject({
      pageId: localId(db, "Tasks DB"),
    });
    expect(projectsBlocks[2].kind).toBe("LINK");
    expect(
      warnings.find(
        (w) => w.code === "link_unresolved" && w.externalId === ID.projects
      )?.message
    ).toContain("1 link");

    const roadmap =
      db.pages.get(localId(db, "Roadmap"))?.blocks.map(nodeData) ?? [];
    const kinds = roadmap.map((b) => b.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["CALLOUT", "IMAGE", "FILE", "BOOKMARK", "LINK"])
    );
    const image = roadmap.find((b) => b.kind === "IMAGE");
    expect(image?.data.url).toMatch(/^\/api\/pages\//);
    expect(image?.data.assetId).toBeTruthy();
    expect(calls).toContain(SIGNED_IMAGE);
    // External media is not downloaded.
    expect(calls.some((u) => u.includes("example.com"))).toBe(false);
    const bookmark = roadmap.find((b) => b.kind === "BOOKMARK");
    expect(bookmark?.data.url).toBe("https://example.com/article");
    expect(
      warnings.find((w) => w.code === "unsupported_block")?.message
    ).toContain("breadcrumb");
  });

  it("warns about truncated pages and blocks Notion did not return, and imports the rest", async () => {
    const { db, store, source } = setup();
    const { warnings } = await runNotionImport({
      source,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    const orphan = warnings
      .filter((w) => w.externalId === ID.orphan)
      .map((w) => w.code);
    expect(orphan).toEqual(
      expect.arrayContaining(["truncated", "unknown_blocks"])
    );
    expect(db.pages.get(localId(db, "Orphan"))?.blocks.length).toBeGreaterThan(
      0
    );
  });

  it("a second run creates nothing, rewrites nothing and fetches no bodies", async () => {
    const { db, store, source, notion } = setup();
    const first = downloader();
    await runNotionImport({
      source,
      store,
      guard: allowAll,
      download: first.download,
    });
    const snapshot = {
      pages: db.pages.size,
      assets: db.assets.size,
      writes: [...db.pages.values()].map((p) => p.writes),
    };
    const fetched = notion.calls.markdown.length;

    const second = downloader();
    const { counts } = await runNotionImport({
      source,
      store,
      guard: allowAll,
      download: second.download,
    });
    expect(db.pages.size).toBe(snapshot.pages);
    expect(db.assets.size).toBe(snapshot.assets);
    expect([...db.pages.values()].map((p) => p.writes)).toEqual(
      snapshot.writes
    );
    expect(notion.calls.markdown.length).toBe(fetched);
    expect(second.calls).toEqual([]);
    expect(counts).toEqual({ total: 7, done: 0, skipped: 7, failed: 0 });
  });

  it("updates a page whose last edit moved, in place, reusing the files it already has", async () => {
    const w = world();
    const notion = fakeNotion(w);
    const { db, store } = setup({ source: notion });
    const first = downloader();
    await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: first.download,
    });
    const roadmapId = localId(db, "Roadmap");
    const assetsBefore = db.assets.size;
    const writesBefore = db.pages.get(roadmapId)?.writes ?? 0;

    const index = w.pages.indexOf(roadmapPage);
    w.pages[index] = {
      ...roadmapPage,
      last_edited_time: "2026-10-05T10:00:00.000Z",
      properties: {
        title: {
          id: "title",
          type: "title",
          title: [{ plain_text: "Roadmap v2" }],
        },
      },
    };
    w.markdown[ID.roadmap] = {
      ...w.markdown[ID.roadmap],
      markdown: `${w.markdown[ID.roadmap].markdown}\nAdded paragraph.`,
    };
    notion.calls.markdown.length = 0;

    const second = downloader();
    const { counts } = await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: second.download,
    });
    expect(notion.calls.markdown).toEqual([ID.roadmap]);
    expect(db.pages.size).toBe(7);
    expect(db.pages.get(roadmapId)).toMatchObject({ title: "Roadmap v2" });
    expect(db.pages.get(roadmapId)?.writes).toBe(writesBefore + 1);
    expect(JSON.stringify(db.pages.get(roadmapId)?.blocks)).toContain(
      "Added paragraph."
    );
    expect(second.calls).toEqual([]);
    expect(db.assets.size).toBe(assetsBefore);
    expect(counts).toMatchObject({ done: 1, skipped: 6, failed: 0 });
  });

  it("updates a changed row's values and clears a value Notion emptied", async () => {
    const w = world();
    const notion = fakeNotion(w);
    const { db, store } = setup({ source: notion });
    await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    const [database] = [...db.databases.values()];
    const qty = [...database.properties.values()].find((p) => p.name === "Qty")
      ?.id as string;
    const rowId = localId(db, "Fix login");
    expect(db.records.get(rowId)?.values.get(qty)).toBe(3);

    const changed = {
      ...rowA,
      last_edited_time: "2026-10-06T10:00:00.000Z",
      properties: {
        ...rowA.properties,
        Qty: { id: "b", type: "number", number: null },
      },
    };
    w.rows[0] = changed;
    w.pages[w.pages.indexOf(rowA)] = changed;
    await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(db.records.get(rowId)?.values.has(qty)).toBe(false);
    expect(db.records.size).toBe(2);
  });

  it("keeps two workspaces apart: same Notion ids, no cross writes, a stale mapping gets a fresh row", async () => {
    const db = createMemoryDb();
    const one = setup({ db, workspaceId: "ws-1" });
    await runNotionImport({
      source: one.source,
      store: one.store,
      guard: allowAll,
      download: downloader().download,
    });
    const writesInOne = [...db.pages.values()].map((p) => p.writes);

    const two = setup({ db, workspaceId: "ws-2" });
    await runNotionImport({
      source: two.source,
      store: two.store,
      guard: allowAll,
      download: downloader().download,
    });

    const inOne = [...db.pages.values()].filter(
      (p) => p.workspaceId === "ws-1"
    );
    const inTwo = [...db.pages.values()].filter(
      (p) => p.workspaceId === "ws-2"
    );
    expect(inOne).toHaveLength(7);
    expect(inTwo).toHaveLength(7);
    expect(inOne.map((p) => p.writes)).toEqual(writesInOne);
    // Parents never cross: every parent of a ws-2 page is a ws-2 page.
    for (const page of inTwo) {
      if (page.parentId)
        expect(db.pages.get(page.parentId)?.workspaceId).toBe("ws-2");
    }
    // The assets of a ws-2 page belong to ws-2 pages.
    for (const asset of db.assets.values()) {
      expect(db.pages.get(asset.pageId)).toBeDefined();
    }
    // Running workspace one again: its mappings were taken over by ws-2, so it gets fresh rows
    // and leaves ws-2 as it was.
    const twoWrites = inTwo.map((p) => p.writes);
    await runNotionImport({
      source: one.source,
      store: one.store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(
      [...db.pages.values()]
        .filter((p) => p.workspaceId === "ws-2")
        .map((p) => p.writes)
    ).toEqual(twoWrites);
    expect(
      [...db.pages.values()].filter((p) => p.workspaceId === "ws-1").length
    ).toBe(14);
  });

  it("keeps a file as a link and says so when it is over the per-file cap, fails to download, or the run budget is gone", async () => {
    const { db, store, source } = setup();
    const big = downloader((url) => (url === SIGNED_IMAGE ? 50 : 4));
    const { warnings } = await runNotionImport({
      source,
      store,
      guard: allowAll,
      download: big.download,
      limits: { fileBytes: 10, runBytes: 1000 },
    });
    const roadmap =
      db.pages.get(localId(db, "Roadmap"))?.blocks.map(nodeData) ?? [];
    const image = roadmap.find((b) => b.kind === "IMAGE");
    expect(image?.data.url).toBe(SIGNED_IMAGE);
    expect(image?.data.assetId).toBeUndefined();
    expect(
      warnings.find((w) => w.code === "asset_oversize")?.message
    ).toContain("expire");
    // The file under the cap was still brought in.
    expect(
      roadmap.find((b) => b.kind === "FILE" && b.data.assetId)
    ).toBeTruthy();

    const failing = setup();
    const broken = jest
      .fn()
      .mockRejectedValue(new SafeFetchError("network", "down"));
    const result = await runNotionImport({
      source: failing.source,
      store: failing.store,
      guard: allowAll,
      download: broken,
    });
    expect(codes(result.warnings)).toContain("asset_failed");
    expect(result.counts.failed).toBe(0);
    expect(failing.db.assets.size).toBe(0);

    const budget = setup();
    const tiny = downloader(() => 6);
    const out = await runNotionImport({
      source: budget.source,
      store: budget.store,
      guard: allowAll,
      download: tiny.download,
      limits: { fileBytes: 10, runBytes: 7 },
    });
    expect(codes(out.warnings)).toContain("asset_budget");
    expect(budget.db.assets.size).toBe(1);
    expect(out.counts.failed).toBe(0);
  });

  it("skips a row it may not create and says why", async () => {
    const { db, store, source } = setup();
    const guard: ImportLimitGuard = {
      allowCreate: async (type) =>
        type === "record"
          ? { allowed: false, reason: "Row limit reached." }
          : { allowed: true },
    };
    const { counts, warnings } = await runNotionImport({
      source,
      store,
      guard,
      download: downloader().download,
    });
    expect(db.records.size).toBe(0);
    expect(counts.skipped).toBe(2);
    expect(warnings.filter((w) => w.code === "plan_limit")).toHaveLength(2);
  });

  it("counts one page failing and carries on", async () => {
    const w = world();
    delete w.markdown[ID.roadmap];
    const notion = fakeNotion(w);
    const { store } = setup({ source: notion });
    const { counts, warnings } = await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(counts).toMatchObject({ failed: 1, done: 6 });
    expect(warnings.find((w) => w.code === "write_failed")).toMatchObject({
      externalId: ID.roadmap,
    });
  });

  it("ends the run after three rate-limit failures in a row, and at once on an unauthorized token", async () => {
    const limited = fakeNotion();
    limited.getPageMarkdown = async () => {
      throw new NotionApiError(
        "rate_limited",
        "Notion is limiting requests right now.",
        429
      );
    };
    const a = setup({ source: limited });
    await expect(
      runNotionImport({
        source: limited,
        store: a.store,
        guard: allowAll,
        download: downloader().download,
      })
    ).rejects.toMatchObject({ code: "rate_limited" });

    const revoked = fakeNotion();
    let calls = 0;
    revoked.getPageMarkdown = async () => {
      calls += 1;
      throw new NotionApiError("unauthorized", "no", 401);
    };
    const b = setup({ source: revoked });
    await expect(
      runNotionImport({
        source: revoked,
        store: b.store,
        guard: allowAll,
        download: downloader().download,
      })
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(calls).toBe(1);

    // One refused page among good ones does not end the run.
    const oneForbidden = fakeNotion();
    const real = oneForbidden.getPageMarkdown.bind(oneForbidden);
    oneForbidden.getPageMarkdown = async (id) => {
      if (id === ID.orphan) throw new NotionApiError("forbidden", "no", 403);
      return real(id);
    };
    const c = setup({ source: oneForbidden });
    const { counts } = await runNotionImport({
      source: oneForbidden,
      store: c.store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(counts.failed).toBe(1);
    expect(counts.done).toBe(6);
  });

  it("warns and goes on when a database's rows cannot be read", async () => {
    const notion = fakeNotion();
    notion.queryDataSource = async () => {
      throw new NotionApiError("not_found", "gone", 404);
    };
    const { db, store } = setup({ source: notion });
    const { warnings } = await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(codes(warnings)).toContain("database_rows_failed");
    expect(pageByTitle(db, "Tasks DB")).toBeDefined();
    expect(db.records.size).toBe(0);
  });

  it("warns when a database holds more rows than one query returns", async () => {
    const notion = fakeNotion();
    const base = notion.queryDataSource.bind(notion);
    notion.queryDataSource = async (id, cursor) => ({
      ...(await base(id, cursor)),
      request_status: { type: "incomplete" },
    });
    const { store } = setup({ source: notion });
    const { warnings } = await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(codes(warnings)).toContain("database_truncated");
  });

  it("makes roots of pages caught in a parent cycle", async () => {
    const w = world();
    w.pages = [
      { ...roadmapPage, parent: { type: "page_id", page_id: ID.orphan } },
      {
        ...roadmapPage,
        id: ID.orphan,
        properties: {
          title: { id: "title", type: "title", title: [{ plain_text: "B" }] },
        },
        parent: { type: "page_id", page_id: ID.roadmap },
      },
    ];
    w.dataSources = [];
    w.rows = [];
    const notion = fakeNotion(w);
    const { db, store } = setup({ source: notion });
    await runNotionImport({
      source: notion,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(db.pages.size).toBe(2);
    expect([...db.pages.values()].some((p) => p.parentId === null)).toBe(true);
  });

  it("stops when cancelled, between items", async () => {
    const { store, source } = setup();
    let checks = 0;
    await expect(
      runNotionImport({
        source,
        store,
        guard: allowAll,
        download: downloader().download,
        hooks: { isCancelled: async () => ++checks > 6 },
      })
    ).rejects.toBeInstanceOf(ImportCancelledError);
  });

  it("reports progress with the counts and warnings so far", async () => {
    const { store, source } = setup();
    const seen: number[] = [];
    await runNotionImport({
      source,
      store,
      guard: allowAll,
      download: downloader().download,
      hooks: {
        onProgress: async (counts) =>
          void seen.push(counts.done + counts.skipped + counts.failed),
      },
    });
    expect(seen.length).toBeGreaterThan(5);
    expect(seen[seen.length - 1]).toBe(7);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("gives an empty page one empty paragraph", async () => {
    const { db, store, source } = setup();
    await runNotionImport({
      source,
      store,
      guard: allowAll,
      download: downloader().download,
    });
    expect(db.pages.get(localId(db, "Write docs"))?.blocks).toHaveLength(1);
  });
});
