-- Additive: app-provisioned sandbox accounts (docs/sandbox-accounts.md).
-- CreateEnum
CREATE TYPE "SandboxKind" AS ENUM ('reviewer', 'publicDemo');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sandboxKind" "SandboxKind";
