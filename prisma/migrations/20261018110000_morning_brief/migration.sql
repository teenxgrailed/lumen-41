-- Additive: the morning brief Ask writes for a person's day (Pro), cached per user and day.
CREATE TABLE "MorningBrief" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MorningBrief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MorningBrief_userId_date_key" ON "MorningBrief"("userId", "date");

ALTER TABLE "MorningBrief" ADD CONSTRAINT "MorningBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
