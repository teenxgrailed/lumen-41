import type { PageBlockInput } from "@/services/pages/page-write-path";
import type {
  DatabasePropertyType,
  ImportEntityType,
  Prisma,
} from "@prisma/client";

/**
 * The slice of the Notion API the importer reads. Notion's objects are large
 * and change; these types name only what is used, and every reader treats a
 * missing or oddly shaped field as absent rather than trusting the type.
 */

export interface NotionTokens {
  accessToken: string;
  refreshToken: string | null;
}

export interface NotionRichText {
  plain_text?: string;
  href?: string | null;
}

export interface NotionParent {
  type?: string;
  page_id?: string;
  database_id?: string;
  data_source_id?: string;
  block_id?: string;
  workspace?: boolean;
}

export interface NotionFile {
  type?: "file" | "external" | string;
  name?: string;
  file?: { url?: string };
  external?: { url?: string };
}

export interface NotionIcon {
  type?: string;
  emoji?: string;
  file?: { url?: string };
  external?: { url?: string };
}

export interface NotionPage {
  object: "page";
  id: string;
  last_edited_time?: string;
  in_trash?: boolean;
  archived?: boolean;
  is_archived?: boolean;
  url?: string;
  parent?: NotionParent;
  properties?: Record<string, NotionPropertyValue>;
  icon?: NotionIcon | null;
  cover?: NotionFile | null;
}

/** A property value on a page; the member named by `type` carries the value. */
export interface NotionPropertyValue {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

export interface NotionSelectOption {
  name?: string;
}

/** A property definition on a data source. */
export interface NotionPropertySchema {
  id?: string;
  name?: string;
  type?: string;
  select?: { options?: NotionSelectOption[] };
  multi_select?: { options?: NotionSelectOption[] };
  status?: { options?: NotionSelectOption[] };
}

export interface NotionDataSource {
  object: "data_source";
  id: string;
  title?: NotionRichText[];
  last_edited_time?: string;
  in_trash?: boolean;
  archived?: boolean;
  parent?: NotionParent;
  database_parent?: NotionParent;
  properties?: Record<string, NotionPropertySchema>;
  icon?: NotionIcon | null;
}

export interface NotionList {
  object?: "list";
  results: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
  request_status?: { type?: string; incomplete_reason?: string };
}

export interface NotionMarkdown {
  markdown: string;
  truncated?: boolean;
  unknown_block_ids?: string[];
}

export interface NotionBlock {
  id?: string;
  type?: string;
  parent?: NotionParent;
  [key: string]: unknown;
}

/** Narrow client surface the importer uses; tests supply a fake. */
export interface NotionSource {
  search(kind: "page" | "data_source", cursor?: string): Promise<NotionList>;
  queryDataSource(id: string, cursor?: string): Promise<NotionList>;
  getPageMarkdown(id: string): Promise<NotionMarkdown>;
  getBlock(id: string): Promise<NotionBlock>;
}

/* ---------- store seam ---------- */

export type NotionEntityType = Extract<
  ImportEntityType,
  "page" | "database" | "record" | "asset"
>;

export interface NotionMapping {
  localId: string;
  sourceUpdatedAt: Date | null;
}

export interface PageWrite {
  title: string;
  /** An emoji, or null. */
  icon: string | null;
  parentId: string | null;
  position: number;
}

export interface PlannedDatabaseProperty {
  name: string;
  type: DatabasePropertyType;
  config: { options: string[] } | null;
}

export type StoredValue = Prisma.InputJsonValue;

export interface SavedAsset {
  id: string;
  url: string;
}

/**
 * Database seam for the Notion importer; Prisma in production. Every method
 * is scoped to the run's user and workspace: a mapped id outside them counts
 * as missing (findMapped returns null) and the importer writes a fresh row.
 */
export interface NotionImportStore {
  findMapped(
    entityType: NotionEntityType,
    externalId: string
  ): Promise<NotionMapping | null>;
  saveMapping(
    entityType: NotionEntityType,
    externalId: string,
    localId: string,
    sourceUpdatedAt: Date | null
  ): Promise<void>;
  /** Creates (existingId null) or updates a page; returns its id. */
  writePage(
    existingId: string | null,
    page: PageWrite
  ): Promise<{ id: string }>;
  setCover(pageId: string, coverUrl: string | null): Promise<void>;
  /** Makes the page a database with these properties; returns ids by name. */
  writeDatabase(
    pageId: string,
    properties: PlannedDatabaseProperty[]
  ): Promise<{ databaseId: string; propertyIds: Map<string, string> }>;
  /** Makes the page a row of the database and stores its values. */
  writeRecord(
    pageId: string,
    databaseId: string,
    position: number,
    values: Map<string, StoredValue>,
    /** Every property the import manages; those without a value are cleared. */
    managedPropertyIds: string[]
  ): Promise<void>;
  writeBlocks(pageId: string, blocks: PageBlockInput[]): Promise<void>;
  saveAsset(
    pageId: string,
    asset: { name: string; mimeType: string; bytes: Buffer }
  ): Promise<SavedAsset>;
  /** The asset's URL when it still exists on that page. */
  assetUrl(pageId: string, assetId: string): Promise<string | null>;
}
