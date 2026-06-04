-- CreateTable
CREATE TABLE "WatchlistRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneFilter" TEXT[],
    "minPEscalation" DOUBLE PRECISION,
    "minSurpriseScore" DOUBLE PRECISION,
    "minThreatLevel" INTEGER,
    "webhookUrl" TEXT,
    "slackWebhookUrl" TEXT,
    "dedupWindowHours" INTEGER NOT NULL DEFAULT 24,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "conflictId" TEXT NOT NULL,
    "pEscalation" DOUBLE PRECISION,
    "surpriseScore" DOUBLE PRECISION,
    "threatLevel" INTEGER,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "deliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchlistRule_userId_idx" ON "WatchlistRule"("userId");

-- CreateIndex
CREATE INDEX "Alert_ruleId_idx" ON "Alert"("ruleId");

-- CreateIndex
CREATE INDEX "Alert_conflictId_idx" ON "Alert"("conflictId");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- AddForeignKey
ALTER TABLE "WatchlistRule" ADD CONSTRAINT "WatchlistRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WatchlistRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
