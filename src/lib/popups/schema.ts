import { z } from "zod";

import {
  ANNOUNCEMENT_KINDS,
  BULLET_ICONS,
  POPUP_ACTIONS,
  POPUP_PLANS,
  POPUP_PLATFORMS,
} from "./types";

/** A same-origin path only: no scheme, no host, no protocol-relative `//`. */
const samePath = z
  .string()
  .max(300)
  .regex(/^\/(?!\/)[^\s]*$/, "Use a path that starts with a single /");

/** An image the app already serves, or an https URL. */
const imageUrl = z
  .string()
  .max(500)
  .refine((v) => /^\/(?!\/)[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v), {
    message: "Use an https URL or a path that starts with /",
  });

const cta = z
  .object({
    label: z.string().trim().min(1).max(40),
    href: samePath.optional(),
    action: z.enum(POPUP_ACTIONS).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.href) !== Boolean(v.action), {
    message: "Give either href or action, not both",
  });

const bullet = z
  .object({
    icon: z.enum(BULLET_ICONS),
    text: z.string().trim().min(1).max(120),
  })
  .strict();

const slug = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits and dashes");

const date = z.coerce.date();

const fields = {
  slug,
  kind: z.enum(ANNOUNCEMENT_KINDS),
  badge: z.string().trim().min(1).max(24).nullable(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(600),
  bullets: z.array(bullet).max(5),
  imageUrl: imageUrl.nullable(),
  primaryCta: cta.nullable(),
  secondaryLabel: z.string().trim().min(1).max(24).nullable(),
  priority: z.number().int().min(-100).max(100),
  startsAt: date.nullable(),
  endsAt: date.nullable(),
  plans: z.array(z.enum(POPUP_PLANS)).max(4),
  platforms: z.array(z.enum(POPUP_PLATFORMS)).max(4),
  minAppVersion: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+){0,3}$/, "Use a version like 1.4.0")
    .nullable(),
  signedUpBefore: date.nullable(),
  signedUpAfter: date.nullable(),
  minActiveDays: z.number().int().min(0).max(3650).nullable(),
};

function windowOk(v: { startsAt?: Date | null; endsAt?: Date | null }) {
  return !(v.startsAt && v.endsAt && v.endsAt <= v.startsAt);
}

const windowIssue = {
  message: "The end must be after the start",
  path: ["endsAt"],
};

/** A new announcement: only slug and title are required; the rest default. */
export const announcementCreateSchema = z
  .object({
    slug: fields.slug,
    title: fields.title,
    kind: fields.kind.default("update"),
    badge: fields.badge.default(null),
    body: fields.body.default(""),
    bullets: fields.bullets.default([]),
    imageUrl: fields.imageUrl.default(null),
    primaryCta: fields.primaryCta.default(null),
    secondaryLabel: fields.secondaryLabel.default("Later"),
    priority: fields.priority.default(0),
    startsAt: fields.startsAt.default(null),
    endsAt: fields.endsAt.default(null),
    plans: fields.plans.default([]),
    platforms: fields.platforms.default([]),
    minAppVersion: fields.minAppVersion.default(null),
    signedUpBefore: fields.signedUpBefore.default(null),
    signedUpAfter: fields.signedUpAfter.default(null),
    minActiveDays: fields.minActiveDays.default(null),
  })
  .strict()
  .refine(windowOk, windowIssue);

/** An edit: any subset of the fields. Status changes go through publish. */
export const announcementUpdateSchema = z
  .object(
    Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v.optional()])
    ) as { [K in keyof typeof fields]: z.ZodOptional<(typeof fields)[K]> }
  )
  .strict()
  .refine(windowOk, windowIssue);

export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>;

export const popupEventSchema = z
  .object({ event: z.enum(["shown", "dismiss", "click", "release"]) })
  .strict();

export type PopupEventName = z.infer<typeof popupEventSchema>["event"];
