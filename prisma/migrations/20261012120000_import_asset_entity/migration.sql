-- Importers, PR 2 (Notion). Expand only: one more entity type, so a second
-- run can reuse the files a page already brought in. Kept in its own
-- migration because ALTER TYPE ... ADD VALUE must not share a transaction
-- with any use of the new value.

ALTER TYPE "ImportEntityType" ADD VALUE 'asset';
