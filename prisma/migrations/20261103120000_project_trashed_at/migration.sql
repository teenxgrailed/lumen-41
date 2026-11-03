-- Additive. Projects can be moved to Trash (soft delete) and restored.
ALTER TABLE "Project" ADD COLUMN "trashedAt" TIMESTAMP(3);
