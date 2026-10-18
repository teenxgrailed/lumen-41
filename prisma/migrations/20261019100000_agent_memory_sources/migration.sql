-- Where a learned memory came from. A separate migration because ALTER TYPE ... ADD VALUE
-- must not share a transaction with statements that use the new value.
ALTER TYPE "AgentMemorySource" ADD VALUE IF NOT EXISTS 'habit';
ALTER TYPE "AgentMemorySource" ADD VALUE IF NOT EXISTS 'document';
ALTER TYPE "AgentMemorySource" ADD VALUE IF NOT EXISTS 'mail';
