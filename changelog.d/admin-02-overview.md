- Admin Users (`/admin/users`): search accounts by email and open one to see
  plan, trial end, created, last sign-in, role and connected provider names
  (never tokens). Each action asks first and is recorded in the new
  `AdminAuditLog` table (additive): make or remove admin, extend the trial,
  grant or revoke Pro for N days or Lifetime as a free comp (stored in the
  existing subscription row; Creem is never called), sign out of all devices,
  and delete the account through the existing deletion service (type the email
  to confirm). An admin cannot remove their own role or delete themselves.
  `GET /api/admin/users`, `GET /api/admin/users/:id`,
  `POST /api/admin/users/:id/actions`.

- Admin Overview (`/admin`): users total and new in 7 days, active trials, Pro,
  Lifetime and Free counts, waitlist size, and the app and worker build SHAs
  (a warning when they differ). `GET /api/admin/overview` (admin only). Users
  now carry a `createdAt` (additive column; older accounts are backfilled from
  their trial start where there is one).
