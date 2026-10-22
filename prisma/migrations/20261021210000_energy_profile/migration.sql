-- Chronotype for the energy curve: additive, read only by the scheduler.
CREATE TABLE "EnergyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chronotype" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnergyProfile_userId_key" ON "EnergyProfile"("userId");

ALTER TABLE "EnergyProfile" ADD CONSTRAINT "EnergyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
