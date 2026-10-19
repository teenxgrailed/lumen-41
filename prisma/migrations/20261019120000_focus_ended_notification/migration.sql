-- Additive: the "Focus ended" notification switch (on by default).
ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "focusEnded" BOOLEAN NOT NULL DEFAULT true;
