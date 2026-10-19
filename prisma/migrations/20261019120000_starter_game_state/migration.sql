-- Additive: whether a person has hidden the Starter game entry card (7 days or for good).
CREATE TABLE "StarterGameState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenUntil" TIMESTAMP(3),
    "neverShow" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarterGameState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StarterGameState_userId_key" ON "StarterGameState"("userId");

ALTER TABLE "StarterGameState" ADD CONSTRAINT "StarterGameState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
