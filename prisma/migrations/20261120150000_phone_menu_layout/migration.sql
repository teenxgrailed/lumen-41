-- CreateTable (additive: a new table, nothing existing is touched)
CREATE TABLE "PhoneMenuLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'tiles',
    "tiles" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneMenuLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneMenuLayout_userId_key" ON "PhoneMenuLayout"("userId");

-- AddForeignKey
ALTER TABLE "PhoneMenuLayout" ADD CONSTRAINT "PhoneMenuLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
