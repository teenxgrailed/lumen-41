-- Owner decision 2026-11-03: the agent hub is open to every account now and
-- keeps improving in place. Turn the global flag on at 100%. It can be turned
-- back off from the admin feature-flag API without a deploy.
INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'agent_hub', true, 100,
  'Agent hub: handoffs and notes between agents (MCP tools, Agents screen)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
