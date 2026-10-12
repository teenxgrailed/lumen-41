import { z } from "zod";

/*
 * What a person may set on a calendar through /api/feeds. Ownership
 * (userId), the connected account (accountId) and the sync state belong to
 * the server and the provider routes; accepting them from the body let a
 * request attach a calendar to someone else's connected account.
 */

const color = z.string().max(32).nullable();

export const feedCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200),
    url: z.string().url().max(2048).nullable().optional(),
    type: z.enum(["LOCAL", "GOOGLE", "OUTLOOK", "CALDAV"]).default("LOCAL"),
    color: color.optional(),
    enabled: z.boolean().optional(),
  })
  .strip();

export const feedUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    color: color.optional(),
    enabled: z.boolean().optional(),
    error: z.string().max(2000).nullable().optional(),
  })
  .strip();

export const feedBatchUpdateSchema = z.object({
  feeds: z.array(
    z
      .object({
        id: z.string().min(1),
        enabled: z.boolean().optional(),
        color: color.optional(),
      })
      .strip()
  ),
});
