-- CreateTable
CREATE TABLE "ChannelLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelLinkCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelUpdate" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalUpdateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelLink_userId_channel_idx" ON "ChannelLink"("userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelLink_channel_externalChatId_key" ON "ChannelLink"("channel", "externalChatId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelLinkCode_codeHash_key" ON "ChannelLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "ChannelLinkCode_userId_channel_idx" ON "ChannelLinkCode"("userId", "channel");

-- CreateIndex
CREATE INDEX "ChannelLinkCode_expiresAt_idx" ON "ChannelLinkCode"("expiresAt");

-- CreateIndex
CREATE INDEX "ChannelUpdate_createdAt_idx" ON "ChannelUpdate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelUpdate_channel_externalUpdateId_key" ON "ChannelUpdate"("channel", "externalUpdateId");

-- AddForeignKey
ALTER TABLE "ChannelLink" ADD CONSTRAINT "ChannelLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelLinkCode" ADD CONSTRAINT "ChannelLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
