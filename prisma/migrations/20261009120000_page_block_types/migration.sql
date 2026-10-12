-- Design v3 port, M3: two block kinds the editor writes. Kept in its own
-- migration because ALTER TYPE ... ADD VALUE must not share a transaction
-- with any use of the new value.

ALTER TYPE "PageBlockType" ADD VALUE 'LEAD';
ALTER TYPE "PageBlockType" ADD VALUE 'TASK_REF';
