import type { DatabasePropertyType } from "@prisma/client";

import { normalizeNotionId } from "./ids";
import type {
  NotionDataSource,
  NotionPage,
  NotionPropertySchema,
  NotionPropertyValue,
  NotionRichText,
} from "./types";

/**
 * Notion database properties to Needt database properties.
 *
 * Needt has no status, people, created-by or unique-id property, and its
 * formula, relation and rollup properties are live (evaluated or linked by
 * Needt), which a Notion snapshot is not. So those arrive as TEXT: a readable
 * string of what Notion showed when the import ran. One warning per database
 * names the kinds that were flattened.
 */

export interface PlannedProperty {
  /** Key in a row's `properties` object (Notion keys them by name). */
  key: string;
  /** Name in Needt, which is also how a second run finds it. */
  name: string;
  notionType: string;
  type: DatabasePropertyType;
  config: { options: string[] } | null;
  /** True when the Notion type is kept as a text snapshot. */
  flattened: boolean;
}

export interface SkippedProperty {
  name: string;
  notionType: string;
}

const DIRECT: Record<string, DatabasePropertyType> = {
  title: "TITLE",
  rich_text: "TEXT",
  number: "NUMBER",
  select: "SELECT",
  status: "SELECT",
  multi_select: "MULTI_SELECT",
  date: "DATE",
  created_time: "DATE",
  last_edited_time: "DATE",
  checkbox: "CHECKBOX",
  url: "URL",
  email: "EMAIL",
  phone_number: "PHONE",
  files: "FILES",
};

const SNAPSHOT_TEXT = new Set([
  "people",
  "relation",
  "rollup",
  "formula",
  "created_by",
  "last_edited_by",
  "unique_id",
  "place",
]);

/** Types with nothing to import (an action, a verification badge). */
const NO_VALUE = new Set(["button", "verification"]);

export function richTextToPlain(text: unknown): string {
  if (!Array.isArray(text)) return "";
  return (text as NotionRichText[]).map((t) => t?.plain_text ?? "").join("");
}

export function dataSourceTitle(source: NotionDataSource): string {
  return richTextToPlain(source.title).trim() || "Untitled database";
}

export function pageTitle(page: NotionPage): string {
  for (const value of Object.values(page.properties ?? {})) {
    if (value?.type === "title") {
      return richTextToPlain(value.title).trim() || "Untitled";
    }
  }
  return "Untitled";
}

function optionNames(schema: NotionPropertySchema): string[] {
  const options =
    schema.select?.options ??
    schema.multi_select?.options ??
    schema.status?.options ??
    [];
  return options.flatMap((o) => (o?.name ? [o.name] : []));
}

export function planProperties(source: NotionDataSource): {
  properties: PlannedProperty[];
  skipped: SkippedProperty[];
} {
  const properties: PlannedProperty[] = [];
  const skipped: SkippedProperty[] = [];
  const entries = Object.entries(source.properties ?? {});
  // The title property leads, as it does in a Needt database.
  entries.sort(
    ([, a], [, b]) => Number(b?.type === "title") - Number(a?.type === "title")
  );
  for (const [key, schema] of entries) {
    const name = (schema?.name || key).trim().slice(0, 120) || "Property";
    const notionType = schema?.type ?? "";
    if (NO_VALUE.has(notionType)) {
      skipped.push({ name, notionType });
      continue;
    }
    const direct = DIRECT[notionType];
    const type: DatabasePropertyType | undefined =
      direct ?? (SNAPSHOT_TEXT.has(notionType) ? "TEXT" : undefined);
    if (!type) {
      skipped.push({ name, notionType: notionType || "unknown" });
      continue;
    }
    const withOptions =
      type === "SELECT" || type === "MULTI_SELECT"
        ? { options: optionNames(schema ?? {}) }
        : null;
    properties.push({
      key,
      name,
      notionType,
      type,
      config: withOptions,
      flattened: !direct,
    });
  }
  return { properties, skipped };
}

/** What a flattened database needs a warning about. */
export class FlattenTracker {
  private readonly kinds = new Map<string, Set<string>>();

  add(kind: string, propertyName: string) {
    const names = this.kinds.get(kind) ?? new Set<string>();
    names.add(propertyName);
    this.kinds.set(kind, names);
  }

  isEmpty() {
    return this.kinds.size === 0;
  }

  describe(): string {
    return [...this.kinds.entries()]
      .map(([kind, names]) => `${kind} (${[...names].join(", ")})`)
      .join("; ");
  }
}

export interface ValueContext {
  /** Title of a page the run knows, for relation snapshots. */
  titleOf(notionId: string): string | null;
  flatten: FlattenTracker;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function userName(user: unknown): string {
  const u = user as { name?: string; id?: string } | null;
  return u?.name?.trim() || "Unknown user";
}

function isoOnly(date: unknown): string | null {
  return typeof date === "string" && date ? date : null;
}

function rollupText(rollup: unknown, ctx: ValueContext): string {
  const r = rollup as { type?: string; [k: string]: unknown } | null;
  switch (r?.type) {
    case "number":
      return r.number === null || r.number === undefined
        ? ""
        : String(r.number);
    case "date":
      return isoOnly((r.date as { start?: string } | null)?.start) ?? "";
    case "array":
      return ((r.array as unknown[]) ?? [])
        .map((item) => snapshotText(item as NotionPropertyValue, ctx))
        .filter(Boolean)
        .join(", ");
    default:
      return "";
  }
}

/** The readable string for a property kept as a text snapshot. */
function snapshotText(value: NotionPropertyValue, ctx: ValueContext): string {
  switch (value.type) {
    case "people":
      return ((value.people as unknown[]) ?? []).map(userName).join(", ");
    case "relation":
      return ((value.relation as { id?: string }[]) ?? [])
        .flatMap((r) => {
          const id = r?.id ? normalizeNotionId(r.id) : null;
          const title = id ? ctx.titleOf(id) : null;
          return title ? [title] : [];
        })
        .join(", ");
    case "rollup":
      return rollupText(value.rollup, ctx);
    case "formula": {
      const f = value.formula as { type?: string; [k: string]: unknown } | null;
      if (!f?.type) return "";
      const inner = f[f.type];
      if (f.type === "date")
        return isoOnly((inner as { start?: string } | null)?.start) ?? "";
      return inner === null || inner === undefined ? "" : String(inner);
    }
    case "created_by":
      return userName(value.created_by);
    case "last_edited_by":
      return userName(value.last_edited_by);
    case "unique_id": {
      const u = value.unique_id as {
        prefix?: string | null;
        number?: number;
      } | null;
      if (u?.number === undefined || u?.number === null) return "";
      return u.prefix ? `${u.prefix}-${u.number}` : String(u.number);
    }
    // Rollup array items and nested values come through as their own types.
    case "title":
      return richTextToPlain(value.title);
    case "rich_text":
      return richTextToPlain(value.rich_text);
    case "number":
      return value.number === null || value.number === undefined
        ? ""
        : String(value.number);
    case "date":
      return isoOnly((value.date as { start?: string } | null)?.start) ?? "";
    case "select":
      return (value.select as { name?: string } | null)?.name ?? "";
    case "place": {
      const p = value.place as { name?: string; address?: string } | null;
      return p?.name || p?.address || "";
    }
    default:
      return "";
  }
}

export interface PlannedFile {
  name: string;
  url: string;
  /** Notion-hosted files expire and are downloaded; external ones are kept. */
  hosted: boolean;
}

export interface MappedValue {
  value: Json | undefined;
  /** Files still to download; `value` then holds the placeholders. */
  files?: PlannedFile[];
}

/**
 * The stored value of one property of one row, or undefined for "nothing to
 * store". Files are returned separately so the importer can download them
 * while their (expiring) URLs are fresh.
 */
export function mapPropertyValue(
  property: PlannedProperty,
  value: NotionPropertyValue | undefined,
  ctx: ValueContext
): MappedValue {
  if (!value) return { value: undefined };
  const type = value.type ?? property.notionType;
  if (property.flattened) {
    ctx.flatten.add(type, property.name);
    const text = snapshotText({ ...value, type }, ctx);
    return { value: text || undefined };
  }
  switch (type) {
    case "title": {
      const text = richTextToPlain(value.title);
      return { value: text || undefined };
    }
    case "rich_text": {
      const text = richTextToPlain(value.rich_text);
      return { value: text || undefined };
    }
    case "number":
      return {
        value: typeof value.number === "number" ? value.number : undefined,
      };
    case "select": {
      const name = (value.select as { name?: string } | null)?.name;
      return { value: name || undefined };
    }
    case "status": {
      const name = (value.status as { name?: string } | null)?.name;
      return { value: name || undefined };
    }
    case "multi_select": {
      const names = ((value.multi_select as { name?: string }[]) ?? []).flatMap(
        (o) => (o?.name ? [o.name] : [])
      );
      return { value: names.length ? names : undefined };
    }
    case "date": {
      const date = value.date as { start?: string; end?: string | null } | null;
      if (date?.end) ctx.flatten.add("date range, start kept", property.name);
      return { value: isoOnly(date?.start) ?? undefined };
    }
    case "created_time":
      return { value: isoOnly(value.created_time) ?? undefined };
    case "last_edited_time":
      return { value: isoOnly(value.last_edited_time) ?? undefined };
    case "checkbox":
      return { value: value.checkbox === true };
    case "url":
      return {
        value:
          typeof value.url === "string" && value.url ? value.url : undefined,
      };
    case "email":
      return {
        value:
          typeof value.email === "string" && value.email
            ? value.email
            : undefined,
      };
    case "phone_number":
      return {
        value:
          typeof value.phone_number === "string" && value.phone_number
            ? value.phone_number
            : undefined,
      };
    case "files": {
      const files: PlannedFile[] = [];
      for (const f of (value.files as {
        name?: string;
        type?: string;
        file?: { url?: string };
        external?: { url?: string };
      }[]) ?? []) {
        const hosted = f?.type === "file";
        const url = hosted ? f?.file?.url : f?.external?.url;
        if (url) files.push({ name: f.name || "file", url, hosted });
      }
      return { value: files.length ? [] : undefined, files };
    }
    default:
      return { value: undefined };
  }
}
