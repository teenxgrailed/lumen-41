import type { PageBlockInput } from "@/services/pages/page-write-path";
import { PageBlockType } from "@prisma/client";
import { createHash } from "node:crypto";

import { newDate } from "@/lib/date-utils";

import { addWarning } from "../apply";
import { type Downloaded, SafeFetchError, safeDownload } from "../safe-fetch";
import {
  ImportCancelledError,
  type ImportCounts,
  type ImportLimitGuard,
  type ImportProgressHooks,
  type ImportWarning,
} from "../types";
import { NotionApiError } from "./client";
import {
  blockIdFromNotionUrl,
  normalizeNotionId,
  pageIdFromNotionUrl,
} from "./ids";
import {
  type BuildDeps,
  type FileRef,
  type MediaKind,
  type NoteCode,
  type UnknownRef,
  buildPageBlocks,
  splitNotionMarkdown,
} from "./markdown";
import {
  FlattenTracker,
  type PlannedProperty,
  dataSourceTitle,
  mapPropertyValue,
  pageTitle,
  planProperties,
} from "./properties";
import type {
  NotionDataSource,
  NotionImportStore,
  NotionList,
  NotionPage,
  NotionParent,
  NotionSource,
  StoredValue,
} from "./types";

/**
 * The Notion import: discover everything the person shared in Notion's page
 * picker, build the tree, then write it in two passes so a link to a page
 * that comes later in the tree still resolves.
 *
 *   1. Structure (parents first): a Page for every page, database and row,
 *      database properties, row values, covers. Local ids now exist for all.
 *   2. Content: each page's body from Notion's markdown endpoint, links to
 *      other imported pages pointing at the local ids, files downloaded the
 *      moment their (expiring) URLs are fetched.
 *
 * A second run updates the pages whose last_edited_time moved and skips the
 * rest; nothing in Needt is ever deleted because it disappeared from Notion.
 */

/** Per-file and per-run caps on downloaded files. */
export const NOTION_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const NOTION_RUN_FILES_MAX_BYTES = 200 * 1024 * 1024;
/** A page has at most this many bookmark/embed lookups (one request each). */
const MAX_BLOCK_LOOKUPS_PER_PAGE = 25;
/** Needt's page write refuses more blocks than this. */
const MAX_BLOCKS_PER_PAGE = 2_000;
/** Systemic failures in a row (rate limit, outage, no access) that end the run. */
const MAX_SYSTEMIC_FAILURES = 3;
const MAX_BLOCK_PARENT_HOPS = 5;
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  txt: "text/plain",
  csv: "text/csv",
};

export interface NotionImportDeps {
  source: NotionSource;
  store: NotionImportStore;
  guard: ImportLimitGuard;
  hooks?: ImportProgressHooks;
  /** Overridable for tests; the real one refuses private addresses. */
  download?: (url: string, maxBytes: number) => Promise<Downloaded>;
  limits?: { fileBytes: number; runBytes: number };
}

type NodeKind = "page" | "database" | "record";

interface Node {
  kind: NodeKind;
  id: string;
  title: string;
  icon: string | null;
  iconSkipped: boolean;
  cover: { url: string; hosted: boolean } | null;
  lastEdited: Date | null;
  parent: NotionParent | undefined;
  page?: NotionPage;
  source?: NotionDataSource;
  /** Rows: the data source they belong to. */
  dataSourceId?: string;
  /** Set in pass 1. */
  localId?: string;
  unchanged?: boolean;
  failed?: boolean;
}

const ENTITY: Record<NodeKind, "page" | "database" | "record"> = {
  page: "page",
  database: "database",
  record: "record",
};

/* ---------- per-page notes ---------- */

class PageNotes {
  private readonly counts = new Map<
    NoteCode | string,
    { n: number; details: Set<string> }
  >();

  note(code: string, detail?: string) {
    const entry = this.counts.get(code) ?? { n: 0, details: new Set<string>() };
    entry.n += 1;
    if (detail) entry.details.add(detail);
    this.counts.set(code, entry);
  }

  emit(warnings: ImportWarning[], title: string, externalId: string) {
    const quoted = `"${title}"`;
    for (const [code, { n, details }] of this.counts) {
      const list = [...details].slice(0, 3).join(", ");
      const plural = n === 1 ? "" : "s";
      const messages: Record<string, string> = {
        equation: `${quoted}: ${n} equation${plural} kept as plain code.`,
        synced_block: `${quoted} has synced blocks; they were imported as ordinary text and will not stay in sync.`,
        unsupported_block: `${quoted}: ${n} block${plural} Needt cannot show were left out${list ? ` (${list})` : ""}.`,
        link_unresolved: `${quoted}: ${n} link${plural} to Notion pages that were not imported stay as Notion links.`,
        truncated: `${quoted} is very large; Notion returned only part of it.`,
        unknown_blocks: `${quoted}: ${n} block${plural} Notion did not return (not shared with the connection, or too large).`,
        asset_failed: `${quoted}: ${n} file${plural} could not be downloaded and still point${n === 1 ? "s" : ""} at Notion (${list}); those links expire.`,
        asset_oversize: `${quoted}: ${n} file${plural} over the size limit stay${n === 1 ? "s" : ""} as links to Notion (${list}); those links expire.`,
        asset_budget: `${quoted}: the run reached its download limit; ${n} file${plural} stay${n === 1 ? "s" : ""} as links to Notion; those links expire.`,
      };
      addWarning(warnings, {
        code,
        message: messages[code] ?? `${quoted}: ${code}.`,
        externalId,
      });
    }
  }
}

/* ---------- helpers ---------- */

function isoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = newDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inTrash(item: {
  in_trash?: boolean;
  archived?: boolean;
  is_archived?: boolean;
}) {
  return (
    item.in_trash === true ||
    item.archived === true ||
    item.is_archived === true
  );
}

function emojiOf(icon: { type?: string; emoji?: string } | null | undefined) {
  return icon?.type === "emoji" && icon.emoji ? icon.emoji : null;
}

function isNotionHosted(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      host === "notion.so" ||
      host.endsWith(".notion.so") ||
      host.endsWith("notion-static.com") ||
      host.endsWith("notionusercontent.com")
    ) {
      return true;
    }
    return (
      host.endsWith(".amazonaws.com") && url.searchParams.has("X-Amz-Signature")
    );
  } catch {
    return false;
  }
}

/** The part of a signed URL that does not change when it is signed again. */
function stableFileKey(raw: string): string {
  try {
    const url = new URL(raw);
    return createHash("sha256")
      .update(`${url.hostname}${url.pathname}`)
      .digest("hex");
  } catch {
    return createHash("sha256").update(raw).digest("hex");
  }
}

function fileNameOf(raw: string, fallback = "file"): string {
  try {
    const last = new URL(raw).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).slice(0, 200) : fallback;
  } catch {
    return fallback;
  }
}

function mimeOf(name: string, header: string | null): string {
  const declared = header?.split(";")[0].trim().toLowerCase();
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== "binary/octet-stream"
  ) {
    return declared;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? "application/octet-stream";
}

class FileBudget {
  used = 0;
  constructor(
    readonly perFile: number,
    readonly total: number
  ) {}
  remaining() {
    return Math.max(0, this.total - this.used);
  }
}

function nodeEntries(list: NotionList): unknown[] {
  return Array.isArray(list.results) ? list.results : [];
}

/* ---------- the run ---------- */

export async function runNotionImport(
  deps: NotionImportDeps
): Promise<{ counts: ImportCounts; warnings: ImportWarning[] }> {
  const { source, store, guard } = deps;
  const hooks = deps.hooks ?? {};
  const download =
    deps.download ??
    ((url: string, maxBytes: number) => safeDownload(url, { maxBytes }));
  const budget = new FileBudget(
    deps.limits?.fileBytes ?? NOTION_FILE_MAX_BYTES,
    deps.limits?.runBytes ?? NOTION_RUN_FILES_MAX_BYTES
  );
  const warnings: ImportWarning[] = [];
  const counts: ImportCounts = { total: 0, done: 0, skipped: 0, failed: 0 };
  let systemicFailures = 0;
  let iconsSkipped = 0;

  async function progress() {
    if (hooks.isCancelled && (await hooks.isCancelled())) {
      throw new ImportCancelledError();
    }
    await hooks.onProgress?.({ ...counts }, warnings);
  }

  /** Runs one item; its failure is counted and warned about, not fatal. */
  async function guarded(node: Node, label: string, work: () => Promise<void>) {
    try {
      await work();
      systemicFailures = 0;
    } catch (error) {
      if (error instanceof ImportCancelledError) throw error;
      node.failed = true;
      counts.failed += 1;
      const reason =
        error instanceof NotionApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      addWarning(warnings, {
        code: "write_failed",
        message: `Could not import ${label} "${node.title}": ${reason}`,
        externalId: node.id,
      });
      if (error instanceof NotionApiError) {
        if (error.code === "unauthorized") throw error;
        if (["rate_limited", "forbidden", "unavailable"].includes(error.code)) {
          systemicFailures += 1;
          if (systemicFailures >= MAX_SYSTEMIC_FAILURES) throw error;
        }
      }
    } finally {
      await progress();
    }
  }

  /* ----- discovery ----- */

  async function paginate(
    fetchPage: (cursor?: string) => Promise<NotionList>,
    onResult: (item: unknown) => void
  ): Promise<{ incomplete: boolean }> {
    let cursor: string | undefined;
    let incomplete = false;
    do {
      if (hooks.isCancelled && (await hooks.isCancelled())) {
        throw new ImportCancelledError();
      }
      const list = await fetchPage(cursor);
      for (const item of nodeEntries(list)) onResult(item);
      if (list.request_status?.type === "incomplete") incomplete = true;
      cursor = list.has_more && list.next_cursor ? list.next_cursor : undefined;
    } while (cursor);
    return { incomplete };
  }

  const pageObjects: NotionPage[] = [];
  await paginate(
    (cursor) => source.search("page", cursor),
    (item) => {
      const page = item as NotionPage;
      if (page?.object === "page" && page.id && !inTrash(page))
        pageObjects.push(page);
    }
  );
  const sourceObjects: NotionDataSource[] = [];
  await paginate(
    (cursor) => source.search("data_source", cursor),
    (item) => {
      const ds = item as NotionDataSource;
      if (ds?.object === "data_source" && ds.id && !inTrash(ds))
        sourceObjects.push(ds);
    }
  );

  const nodes = new Map<string, Node>();
  const order: Node[] = [];
  const add = (node: Node) => {
    if (nodes.has(node.id)) return;
    nodes.set(node.id, node);
    order.push(node);
  };

  const dataSourceIds = new Set<string>();
  const databaseToSource = new Map<string, string>();
  for (const ds of sourceObjects) {
    const id = normalizeNotionId(ds.id);
    if (!id) continue;
    dataSourceIds.add(id);
    const databaseId =
      ds.parent?.database_id && normalizeNotionId(ds.parent.database_id);
    if (databaseId && !databaseToSource.has(databaseId))
      databaseToSource.set(databaseId, id);
  }

  const isRowOfKnownSource = (page: NotionPage) => {
    const parent = page.parent;
    const viaSource =
      parent?.data_source_id && normalizeNotionId(parent.data_source_id);
    if (viaSource && dataSourceIds.has(viaSource)) return true;
    const viaDatabase =
      parent?.database_id && normalizeNotionId(parent.database_id);
    return Boolean(viaDatabase && databaseToSource.has(viaDatabase));
  };

  const makePageNode = (
    page: NotionPage,
    kind: "page" | "record",
    dataSourceId?: string
  ): Node | null => {
    const id = normalizeNotionId(page.id);
    if (!id) return null;
    const cover = page.cover;
    const coverUrl =
      cover?.type === "file"
        ? cover.file?.url
        : cover?.type === "external"
          ? cover.external?.url
          : undefined;
    const emoji = emojiOf(page.icon);
    return {
      kind,
      id,
      title: pageTitle(page),
      icon: emoji,
      iconSkipped: Boolean(page.icon && !emoji),
      cover: coverUrl
        ? { url: coverUrl, hosted: cover?.type === "file" }
        : null,
      lastEdited: isoDate(page.last_edited_time),
      parent: page.parent,
      page,
      dataSourceId,
    };
  };

  for (const page of pageObjects) {
    if (isRowOfKnownSource(page)) continue;
    const node = makePageNode(page, "page");
    if (node) add(node);
  }
  for (const ds of sourceObjects) {
    const id = normalizeNotionId(ds.id);
    if (!id) continue;
    const emoji = emojiOf(ds.icon);
    add({
      kind: "database",
      id,
      title: dataSourceTitle(ds),
      icon: emoji,
      iconSkipped: Boolean(ds.icon && !emoji),
      cover: null,
      lastEdited: isoDate(ds.last_edited_time),
      parent: ds.database_parent,
      source: ds,
    });
  }

  // Rows come from the data source query, which is complete and paginated.
  for (const ds of sourceObjects) {
    const dsId = normalizeNotionId(ds.id);
    if (!dsId) continue;
    try {
      const { incomplete } = await paginate(
        (cursor) => source.queryDataSource(ds.id, cursor),
        (item) => {
          const row = item as NotionPage;
          if (row?.object !== "page" || !row.id || inTrash(row)) return;
          const node = makePageNode(row, "record", dsId);
          if (node) {
            node.parent = { type: "data_source_id", data_source_id: dsId };
            add(node);
          }
        }
      );
      if (incomplete) {
        addWarning(warnings, {
          code: "database_truncated",
          message: `"${dataSourceTitle(ds)}" has more rows than Notion returns in one query; only the first 10,000 were imported.`,
          externalId: dsId,
        });
      }
    } catch (error) {
      if (error instanceof ImportCancelledError) throw error;
      if (error instanceof NotionApiError && error.code === "unauthorized")
        throw error;
      addWarning(warnings, {
        code: "database_rows_failed",
        message: `Could not read the rows of "${dataSourceTitle(ds)}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        externalId: dsId,
      });
    }
  }

  counts.total = order.length;
  await progress();

  /* ----- tree ----- */

  const blockOwners = new Map<string, string | null>();
  async function ownerOfBlock(blockId: string): Promise<string | null> {
    let current = blockId;
    for (let hop = 0; hop < MAX_BLOCK_PARENT_HOPS; hop += 1) {
      const known = blockOwners.get(current);
      if (known !== undefined) return known;
      let parent: NotionParent | undefined;
      try {
        parent = (await source.getBlock(current)).parent;
      } catch (error) {
        if (error instanceof NotionApiError && error.code === "unauthorized")
          throw error;
        blockOwners.set(current, null);
        return null;
      }
      const page = parent?.page_id && normalizeNotionId(parent.page_id);
      if (page) {
        blockOwners.set(blockId, page);
        return page;
      }
      const viaSource =
        parent?.data_source_id && normalizeNotionId(parent.data_source_id);
      if (viaSource) return viaSource;
      const next = parent?.block_id && normalizeNotionId(parent.block_id);
      if (!next) return null;
      current = next;
    }
    return null;
  }

  async function parentOf(node: Node): Promise<string | null> {
    const parent = node.parent;
    if (!parent) return null;
    let id: string | null = null;
    if (parent.page_id) id = normalizeNotionId(parent.page_id);
    else if (parent.data_source_id)
      id = normalizeNotionId(parent.data_source_id);
    else if (parent.database_id) {
      const databaseId = normalizeNotionId(parent.database_id);
      id = (databaseId && databaseToSource.get(databaseId)) || null;
    } else if (parent.block_id) {
      const blockId = normalizeNotionId(parent.block_id);
      id = blockId ? await ownerOfBlock(blockId) : null;
    }
    return id && id !== node.id && nodes.has(id) ? id : null;
  }

  const children = new Map<string | null, Node[]>();
  for (const node of order) {
    const parentId = await parentOf(node);
    const list = children.get(parentId) ?? [];
    list.push(node);
    children.set(parentId, list);
  }
  const positions = new Map<string, number>();
  const parentIds = new Map<string, string | null>();
  for (const [parentId, list] of children) {
    list.forEach((node, index) => {
      positions.set(node.id, (index + 1) * 1024);
      parentIds.set(node.id, parentId);
    });
  }
  // Parents first. Anything a cycle left unreachable goes last, as a root.
  const sequence: Node[] = [];
  const seen = new Set<string>();
  const visit = (node: Node) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    sequence.push(node);
    for (const child of children.get(node.id) ?? []) visit(child);
  };
  for (const root of children.get(null) ?? []) visit(root);
  for (const node of order) {
    if (!seen.has(node.id)) {
      parentIds.set(node.id, null);
      visit(node);
    }
  }

  const titles = new Map(order.map((n) => [n.id, n.title]));
  const localIds = new Map<string, { localId: string; title: string }>();

  /* ----- files ----- */

  /**
   * Brings one Notion-hosted file into the page (once; a second run finds it
   * again by the stable part of its URL). Over a cap or failing, the file
   * stays a link to Notion and the page gets a note.
   */
  async function fileFor(
    pageLocalId: string,
    pageNotionId: string,
    notes: PageNotes,
    url: string,
    nameHint: string
  ): Promise<FileRef> {
    const name = nameHint || fileNameOf(url);
    if (!url || !isNotionHosted(url)) return { url, name };
    const key = `${pageNotionId}:${stableFileKey(url)}`;
    const mapped = await store.findMapped("asset", key);
    if (mapped) {
      const existing = await store.assetUrl(pageLocalId, mapped.localId);
      if (existing) return { url: existing, name, assetId: mapped.localId };
    }
    if (budget.remaining() <= 0) {
      notes.note("asset_budget", name);
      return { url, name };
    }
    const limit = Math.min(budget.perFile, budget.remaining());
    try {
      const file = await download(url, limit);
      const mimeType = mimeOf(name, file.contentType);
      const saved = await store.saveAsset(pageLocalId, {
        name,
        mimeType,
        bytes: file.bytes,
      });
      await store.saveMapping("asset", key, saved.id, null);
      budget.used += file.bytes.byteLength;
      return { url: saved.url, name, assetId: saved.id, mimeType };
    } catch (error) {
      if (error instanceof SafeFetchError && error.code === "too_large") {
        // Over the per-file cap, or more than the run has left.
        notes.note(
          limit < budget.perFile ? "asset_budget" : "asset_oversize",
          name
        );
      } else {
        notes.note("asset_failed", name);
      }
      return { url, name };
    }
  }

  /* ----- pass 1: structure ----- */

  const flatteners = new Map<string, FlattenTracker>();
  const databaseInfo = new Map<
    string,
    {
      databaseId: string;
      localPageId: string;
      planned: PlannedProperty[];
      propertyIds: Map<string, string>;
    }
  >();

  async function writeStructure(node: Node) {
    const entity = ENTITY[node.kind];
    const existing = await store.findMapped(entity, node.id);
    const changed =
      !existing ||
      !existing.sourceUpdatedAt ||
      !node.lastEdited ||
      existing.sourceUpdatedAt.getTime() < node.lastEdited.getTime();

    if (!existing) {
      const limit = await guard.allowCreate(entity);
      if (!limit.allowed) {
        counts.skipped += 1;
        node.failed = true;
        addWarning(warnings, {
          code: "plan_limit",
          message: limit.reason,
          externalId: node.id,
        });
        await progress();
        return;
      }
    }

    const parentNotionId = parentIds.get(node.id) ?? null;
    const parentLocal = parentNotionId
      ? (localIds.get(parentNotionId)?.localId ?? null)
      : null;

    await guarded(node, entity === "record" ? "row" : entity, async () => {
      let pageId = existing?.localId ?? null;
      if (changed || !existing) {
        const written = await store.writePage(pageId, {
          title: node.title,
          icon: node.icon,
          parentId: parentLocal,
          position: positions.get(node.id) ?? 1024,
        });
        pageId = written.id;
        if (node.iconSkipped) iconsSkipped += 1;
        await store.saveMapping(
          entity,
          node.id,
          pageId,
          existing?.sourceUpdatedAt ?? null
        );
      }
      if (!pageId) throw new Error("No local page");
      node.localId = pageId;
      localIds.set(node.id, { localId: pageId, title: node.title });
      // Notion links to a database by its database id, not its data source id.
      const databaseId = node.source?.parent?.database_id;
      const normalizedDatabaseId = databaseId && normalizeNotionId(databaseId);
      if (normalizedDatabaseId && !localIds.has(normalizedDatabaseId)) {
        localIds.set(normalizedDatabaseId, {
          localId: pageId,
          title: node.title,
        });
      }

      if (node.kind === "database" && node.source) {
        const { properties, skipped } = planProperties(node.source);
        const written = await store.writeDatabase(
          pageId,
          properties.map((p) => ({
            name: p.name,
            type: p.type,
            config: p.config,
          }))
        );
        databaseInfo.set(node.id, {
          databaseId: written.databaseId,
          localPageId: pageId,
          planned: properties,
          propertyIds: written.propertyIds,
        });
        const tracker = new FlattenTracker();
        for (const p of properties)
          if (p.flattened) tracker.add(p.notionType, p.name);
        for (const p of skipped)
          tracker.add(`${p.notionType}, not imported`, p.name);
        flatteners.set(node.id, tracker);
        // A database has no body: it is finished here.
        if (changed) {
          await store.saveMapping(entity, node.id, pageId, node.lastEdited);
          counts.done += 1;
        } else {
          counts.skipped += 1;
        }
        node.unchanged = true;
        return;
      }

      if (!changed) {
        node.unchanged = true;
        counts.skipped += 1;
        return;
      }

      const notes = new PageNotes();
      if (node.cover) {
        const file = node.cover.hosted
          ? await fileFor(pageId, node.id, notes, node.cover.url, "cover")
          : { url: node.cover.url };
        await store.setCover(pageId, file.url || null);
      }

      if (node.kind === "record" && node.dataSourceId) {
        await writeRow(node, pageId, notes);
      }
      notes.emit(warnings, node.title, node.id);
    });
  }

  async function writeRow(node: Node, pageId: string, notes: PageNotes) {
    const info = node.dataSourceId
      ? databaseInfo.get(node.dataSourceId)
      : undefined;
    const tracker = node.dataSourceId
      ? flatteners.get(node.dataSourceId)
      : undefined;
    if (!info || !tracker || !node.page) {
      throw new Error("The row's database was not imported");
    }
    const values = new Map<string, StoredValue>();
    for (const property of info.planned) {
      const propertyId = info.propertyIds.get(property.name);
      if (!propertyId) continue;
      const value = (node.page.properties ?? {})[property.key];
      const mapped = mapPropertyValue(property, value, {
        titleOf: (id) => titles.get(id) ?? null,
        flatten: tracker,
      });
      if (mapped.files) {
        const stored: StoredValue[] = [];
        for (const file of mapped.files) {
          const ref = file.hosted
            ? await fileFor(pageId, node.id, notes, file.url, file.name)
            : { url: file.url, name: file.name };
          stored.push({ name: file.name, url: ref.url });
        }
        if (stored.length) values.set(propertyId, stored);
      } else if (mapped.value !== undefined) {
        values.set(propertyId, mapped.value as StoredValue);
      }
    }
    await store.writeRecord(
      pageId,
      info.databaseId,
      positions.get(node.id) ?? 1024,
      values,
      [...info.propertyIds.values()]
    );
  }

  for (const node of sequence) {
    await writeStructure(node);
  }

  for (const node of sequence) {
    const tracker = flatteners.get(node.id);
    if (node.kind === "database" && tracker && !tracker.isEmpty()) {
      addWarning(warnings, {
        code: "properties_flattened",
        message: `"${node.title}": some properties are kept as plain text or left out: ${tracker.describe()}.`,
        externalId: node.id,
      });
    }
  }
  if (iconsSkipped > 0) {
    addWarning(warnings, {
      code: "icons_skipped",
      message: `${iconsSkipped} page icon${iconsSkipped === 1 ? " is" : "s are"} not an emoji and ${iconsSkipped === 1 ? "was" : "were"} left out.`,
    });
  }

  /* ----- pass 2: content ----- */

  async function writeContent(node: Node) {
    const pageId = node.localId;
    if (!pageId) return;
    const notes = new PageNotes();
    const markdown = await source.getPageMarkdown(node.id);
    if (markdown.truncated) notes.note("truncated");
    const unknownIds = markdown.unknown_block_ids ?? [];
    if (unknownIds.length > 0) {
      for (let i = 0; i < unknownIds.length; i += 1)
        notes.note("unknown_blocks");
    }

    const hrefFor = (notionUrl: string) => {
      const id = pageIdFromNotionUrl(notionUrl);
      const found = id ? localIds.get(id) : undefined;
      return found ? `/pages/${found.localId}` : null;
    };
    let lookups = 0;
    const buildDeps: BuildDeps = {
      hrefFor,
      note: (code, detail) => notes.note(code, detail),
      pageFor: (notionUrl) => {
        const id = pageIdFromNotionUrl(notionUrl);
        return id ? (localIds.get(id) ?? null) : null;
      },
      resolveFile: ({
        url,
      }: {
        media: MediaKind;
        url: string;
        caption: string;
      }) => fileFor(pageId, node.id, notes, url, ""),
      resolveUnknown: async ({ url, alt }): Promise<UnknownRef> => {
        const blockId = blockIdFromNotionUrl(url);
        if (
          ["bookmark", "embed", "link_preview"].includes(alt) &&
          blockId &&
          lookups < MAX_BLOCK_LOOKUPS_PER_PAGE
        ) {
          lookups += 1;
          try {
            const block = await source.getBlock(blockId);
            const body = block.type
              ? (block[block.type] as { url?: string } | undefined)
              : undefined;
            if (typeof body?.url === "string" && body.url) {
              return {
                kind: alt === "bookmark" ? "bookmark" : "link",
                url: body.url,
                title: body.url,
              };
            }
          } catch (error) {
            if (
              error instanceof NotionApiError &&
              error.code === "unauthorized"
            )
              throw error;
          }
          if (url) {
            notes.note("unsupported_block", alt);
            return { kind: "link", url, title: "Open in Notion" };
          }
        }
        notes.note("unsupported_block", alt || "unknown");
        return { kind: "skip" };
      },
    };

    const segments = splitNotionMarkdown(markdown.markdown, buildDeps);
    let blocks: PageBlockInput[] = await buildPageBlocks(segments, buildDeps);
    if (blocks.length > MAX_BLOCKS_PER_PAGE) {
      blocks = blocks.slice(0, MAX_BLOCKS_PER_PAGE);
      notes.note("truncated");
    }
    if (blocks.length === 0) {
      blocks = [
        {
          type: PageBlockType.PARAGRAPH,
          content: { text: "" },
          position: 1024,
        },
      ];
    }
    await store.writeBlocks(pageId, blocks);
    await store.saveMapping(
      ENTITY[node.kind],
      node.id,
      pageId,
      node.lastEdited
    );
    notes.emit(warnings, node.title, node.id);
    counts.done += 1;
  }

  for (const node of sequence) {
    if (
      node.kind === "database" ||
      node.failed ||
      node.unchanged ||
      !node.localId
    )
      continue;
    await guarded(node, "page", () => writeContent(node));
  }

  await hooks.onProgress?.({ ...counts }, warnings);
  return { counts, warnings };
}
