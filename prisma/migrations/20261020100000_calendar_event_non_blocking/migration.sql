-- Events shown as free upstream, or declined by the account owner, must not
-- block scheduling. Additive; existing rows default to blocking.
ALTER TABLE "CalendarEvent"
  ADD COLUMN "transparent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfDeclined" BOOLEAN NOT NULL DEFAULT false;

-- Outlook rows already carry showAs in "status".
UPDATE "CalendarEvent" SET "transparent" = true WHERE "status" = 'free';
