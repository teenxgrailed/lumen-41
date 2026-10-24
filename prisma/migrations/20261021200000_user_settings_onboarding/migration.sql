-- Onboarding v3: the answers behind the first week (areas, picked tasks and
-- repeats, rank, workdays, hours, focus window, longest block, buffer, lunch,
-- calendar links, reminder mode). Nullable and additive; null = never saved.
ALTER TABLE "UserSettings" ADD COLUMN "onboarding" JSONB;
