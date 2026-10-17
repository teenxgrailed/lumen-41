-- The "Plan on weekends" switch is gone; Saturday and Sunday are now ordinary
-- days in the per-day working hours. People who had weekends on kept them only
-- in AutoScheduleSettings.workDays, so give their default schedule a window
-- on each of those days (the same hours as their day) when it has none.
INSERT INTO "WorkScheduleWindow"
  ("id", "scheduleId", "dayOfWeek", "startTime", "endTime", "sortOrder", "updatedAt")
SELECT
  gen_random_uuid(),
  ws."id",
  d.day,
  lpad(a."workHourStart"::text, 2, '0') || ':00',
  lpad(a."workHourEnd"::text, 2, '0') || ':00',
  0,
  CURRENT_TIMESTAMP
FROM "AutoScheduleSettings" a
JOIN LATERAL (
  SELECT s."id"
  FROM "WorkSchedule" s
  WHERE s."userId" = a."userId"
  ORDER BY s."isDefault" DESC, s."createdAt" ASC
  LIMIT 1
) ws ON TRUE
CROSS JOIN (VALUES (6), (0)) AS d(day)
WHERE a."workDays" ~ '^\[[0-9, ]*\]$'
  AND (a."workDays")::jsonb @> to_jsonb(d.day)
  AND a."workHourStart" < a."workHourEnd"
  AND NOT EXISTS (
    SELECT 1 FROM "WorkScheduleWindow" w
    WHERE w."scheduleId" = ws."id" AND w."dayOfWeek" = d.day
  );
