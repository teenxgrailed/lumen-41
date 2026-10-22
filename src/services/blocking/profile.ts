import { BlockingMode } from "@prisma/client";
import { z } from "zod";

/** The most profiles one person keeps. */
export const BLOCKING_PROFILES_MAX = 20;
/** The most sites, apps or keywords one list holds. */
export const BLOCKING_LIST_MAX = 500;

const HOST = /^(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]{2,}$/;
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * A site as a person types it ("https://www.YouTube.com/feed", "x.com",
 * "*.reddit.com") reduced to the host the blockers compare against. Returns
 * null for anything that is not a host name.
 */
export function normalizeSite(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  const wildcard = value.startsWith("*.");
  if (wildcard) value = value.slice(2);
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0].split("@").pop() ?? "";
  value = value.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!wildcard) value = value.replace(/^www\./, "");
  const host = wildcard ? `*.${value}` : value;
  return HOST.test(host) ? host : null;
}

function uniqueList(values: string[]): string[] {
  return [...new Set(values)].slice(0, BLOCKING_LIST_MAX);
}

const siteList = z
  .array(z.string().max(253))
  .max(BLOCKING_LIST_MAX)
  .transform((values, ctx) => {
    const out: string[] = [];
    for (const value of values) {
      const host = normalizeSite(value);
      if (!host) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Not a site: ${value}`,
        });
        return z.NEVER;
      }
      out.push(host);
    }
    return uniqueList(out);
  });

const appList = z
  .array(z.string().trim().max(255).regex(BUNDLE_ID, "Not a bundle id"))
  .max(BLOCKING_LIST_MAX)
  .transform(uniqueList);

const keywordList = z
  .array(z.string().trim().min(1).max(80))
  .max(BLOCKING_LIST_MAX)
  .transform((values) => uniqueList(values.map((v) => v.toLowerCase())));

const idList = z
  .array(z.string().min(1).max(64))
  .max(BLOCKING_LIST_MAX)
  .transform(uniqueList);

export const blockingProfileFields = {
  name: z.string().trim().min(1).max(80),
  sites: siteList,
  apps: appList,
  mode: z.nativeEnum(BlockingMode),
  onFocusSession: z.boolean(),
  eventKeywords: keywordList,
  calendarFeedIds: idList,
  projectIds: idList,
  enabled: z.boolean(),
};

export const blockingProfileCreateSchema = z.object({
  name: blockingProfileFields.name,
  sites: blockingProfileFields.sites.default([]),
  apps: blockingProfileFields.apps.default([]),
  mode: blockingProfileFields.mode.default(BlockingMode.BLOCKLIST),
  onFocusSession: blockingProfileFields.onFocusSession.default(false),
  eventKeywords: blockingProfileFields.eventKeywords.default([]),
  calendarFeedIds: blockingProfileFields.calendarFeedIds.default([]),
  projectIds: blockingProfileFields.projectIds.default([]),
  enabled: blockingProfileFields.enabled.default(true),
});

export const blockingProfileUpdateSchema = z
  .object(blockingProfileFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export type BlockingProfileCreate = z.infer<typeof blockingProfileCreateSchema>;
export type BlockingProfileUpdate = z.infer<typeof blockingProfileUpdateSchema>;

/** The fields a profile is returned with, everywhere. */
export const blockingProfileSelect = {
  id: true,
  name: true,
  sites: true,
  apps: true,
  mode: true,
  onFocusSession: true,
  eventKeywords: true,
  calendarFeedIds: true,
  projectIds: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;
