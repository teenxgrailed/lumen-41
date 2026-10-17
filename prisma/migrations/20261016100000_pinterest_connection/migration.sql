-- Additive: a person's Pinterest grant, and the sync state of a moodboard linked to a Pinterest board.
CREATE TABLE "PinterestConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PinterestConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PinterestConnection_userId_key" ON "PinterestConnection"("userId");

ALTER TABLE "PinterestConnection" ADD CONSTRAINT "PinterestConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Moodboard" ADD COLUMN "pinterestSync" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Moodboard" ADD COLUMN "pinterestConnectedById" TEXT;
ALTER TABLE "Moodboard" ADD COLUMN "pinterestSeen" TEXT[] DEFAULT ARRAY[]::TEXT[];
