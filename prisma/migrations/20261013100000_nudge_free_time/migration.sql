-- Additive: a nudge for a long stretch of today nothing is booked into.
ALTER TYPE "ProactiveNudgeType" ADD VALUE IF NOT EXISTS 'FREE_TIME';
