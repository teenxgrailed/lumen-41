/** Which pages count as "shared with me" (places.jsx SharedScreen). */

/**
 * A page counts as shared with the person only when someone else owns it and
 * gave them an explicit grant. `GET /api/pages` computes `sharedWithMe` from
 * the grants; a role inherited from the workspace is not a share, so a
 * workspace page the person merely can see never lands here.
 */
export function isSharedWithMe(row: { sharedWithMe?: boolean | null }) {
  return row.sharedWithMe === true;
}
