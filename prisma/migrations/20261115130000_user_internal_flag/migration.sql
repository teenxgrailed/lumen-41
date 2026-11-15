-- Additive, expand-only: marks accounts that are ours (owner, test addresses,
-- bots) so Admin statistics can leave them out. Default false; no backfill and
-- no existing row is changed. The Admin Overview also derives internal accounts
-- from role, sandboxKind and address patterns without this column.
ALTER TABLE "User" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
