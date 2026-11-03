-- Marks calendars Google cannot push for (holiday, birthday, read-only
-- subscribed) so the webhook sweeps stop retrying them. Additive only.
ALTER TABLE "CalendarFeed" ADD COLUMN "pushUnsupportedAt" TIMESTAMP(3);
