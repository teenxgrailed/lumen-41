/**
 * The Share sheet's rules (prototype DocsScreen.jsx DocShareSheet 813–969),
 * on the real access model: a person gets a `PageAccessGrant` (View → VIEWER,
 * Edit → EDITOR, Full access → FULL_ACCESS), and only workspace members can
 * be invited. "Anyone with the link" is the public read-only publication.
 */
import type {
  DocGrant,
  DocPerson,
  DocRole,
} from "@/lib/needt3/hooks/doc-share";

import strings from "../../../../docs/port/prototype/port/strings/en.json";

const copy = strings["DocsScreen.jsx"].DocShareSheet;

export const ROLE_OPTIONS: [DocRole, string][] = [
  ["VIEWER", copy.can_view],
  ["EDITOR", copy.can_edit],
  ["FULL_ACCESS", "Full access"],
];

export const roleLabel = (role: DocRole) =>
  (ROLE_OPTIONS.find(([r]) => r === role) ?? ROLE_OPTIONS[0])[1];

export const isEmail = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export type InviteCheck =
  | { ok: true; person: DocPerson }
  | { ok: false; reason: "empty" | "invalid" | "owner" | "dupe" | "outside" };

/**
 * What an typed email resolves to: a workspace member who can be granted
 * access, or why not.
 */
export function checkInvite(
  raw: string,
  members: readonly DocPerson[],
  grants: readonly DocGrant[],
  ownerId: string | null
): InviteCheck {
  const e = raw.trim().toLowerCase();
  if (!e) return { ok: false, reason: "empty" };
  if (!isEmail(e)) return { ok: false, reason: "invalid" };
  const m = members.find((p) => (p.email ?? "").toLowerCase() === e);
  if (!m) return { ok: false, reason: "outside" };
  if (m.userId === ownerId) return { ok: false, reason: "owner" };
  if (grants.some((g) => g.userId === m.userId)) {
    return { ok: false, reason: "dupe" };
  }
  return { ok: true, person: m };
}

/** The status line under the sheet's title. */
export function shareSubline(people: number, published: boolean) {
  const n = people === 1 ? "1 person" : `${people} people`;
  if (published) {
    return `Anyone with the link can view${people ? ` · ${n} invited` : ""}`;
  }
  return people ? `Shared with ${n}` : copy.private_only_you_can_see_this_page;
}

export function initials(name: string) {
  return name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const displayName = (p: DocPerson) =>
  p.name || (p.email ? p.email.split("@")[0] : "Someone");
