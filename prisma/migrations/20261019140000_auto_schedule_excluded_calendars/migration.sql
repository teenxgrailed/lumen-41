-- Additive: calendars the person switched off for scheduling. Replaces the
-- "selected" allow-list, which left feeds created later (and the Needt local
-- calendar) out of the busy check.
ALTER TABLE "AutoScheduleSettings" ADD COLUMN "excludedCalendars" TEXT NOT NULL DEFAULT '[]';

-- Keep an explicit old choice: when a person had a non-empty selection, the
-- synced feeds outside it stay excluded. A value that does not parse is skipped.
DO $$
DECLARE
  row_s RECORD;
  excluded TEXT;
BEGIN
  FOR row_s IN
    SELECT "id", "userId", "selectedCalendars"
    FROM "AutoScheduleSettings"
    WHERE "selectedCalendars" ~ '^\s*\[\s*"'
  LOOP
    BEGIN
      SELECT COALESCE(jsonb_agg(f."id")::text, '[]') INTO excluded
      FROM "CalendarFeed" f
      WHERE f."userId" = row_s."userId"
        AND f."type" <> 'LOCAL'
        AND NOT jsonb_exists(row_s."selectedCalendars"::jsonb, f."id");
      UPDATE "AutoScheduleSettings" SET "excludedCalendars" = excluded WHERE "id" = row_s."id";
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END $$;
