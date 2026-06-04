-- AlterTable
ALTER TABLE "Conflict" ADD COLUMN     "currentSituationLine" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "situationStatus" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "classified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "firstReportAt" TIMESTAMP(3),
ADD COLUMN     "locationConfidence" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "severity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "signalAt" TIMESTAMP(3),
ADD COLUMN     "significance" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceTier" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "stabilityImpact" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "summarized" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Heartbeat" ADD COLUMN     "classifyCalls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "escalationCalls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summaryCalls" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EscalationSignal" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "escalationRisk" TEXT NOT NULL DEFAULT 'none',
    "trajectory" TEXT NOT NULL DEFAULT 'stable',
    "drivers" TEXT[],
    "actorsOfConcern" TEXT[],
    "horizon" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "usedEventIds" TEXT[],
    "triggeringFeatures" JSONB NOT NULL DEFAULT '{}',
    "pEscalation" DOUBLE PRECISION,
    "ciLow" DOUBLE PRECISION,
    "ciHigh" DOUBLE PRECISION,
    "horizonDays" INTEGER,
    "modelVersion" TEXT NOT NULL DEFAULT 'v0',
    "resolvedOutcome" BOOLEAN,
    "resolvedAt" TIMESTAMP(3),
    "episodeId" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "EscalationSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeStore" (
    "id" TEXT NOT NULL,
    "conflictId" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "eventTempo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severitySlope" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spreadLocations" INTEGER NOT NULL DEFAULT 0,
    "sourceBreadth" INTEGER NOT NULL DEFAULT 0,
    "actorCount" INTEGER NOT NULL DEFAULT 0,
    "geographyClass" TEXT NOT NULL DEFAULT '',
    "actorTypes" TEXT[],
    "chokepoints" TEXT[],
    "commodityTags" TEXT[],
    "escalatedToNational" BOOLEAN,
    "escalationHorizonDays" INTEGER,
    "assetMovesJson" JSONB,
    "usedEventIds" TEXT[],
    "modelVersion" TEXT NOT NULL DEFAULT 'v0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpisodeStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationRecord" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "pEscalation" DOUBLE PRECISION NOT NULL,
    "ciLow" DOUBLE PRECISION NOT NULL,
    "ciHigh" DOUBLE PRECISION NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "actualOutcome" BOOLEAN,
    "brierScore" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainReliability" (
    "domain" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "reliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "correctionsCount" INTEGER NOT NULL DEFAULT 0,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "totalUsageCount" INTEGER NOT NULL DEFAULT 0,
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainReliability_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE INDEX "EscalationSignal_targetId_idx" ON "EscalationSignal"("targetId");

-- CreateIndex
CREATE INDEX "EscalationSignal_computedAt_idx" ON "EscalationSignal"("computedAt");

-- CreateIndex
CREATE INDEX "EscalationSignal_escalationRisk_idx" ON "EscalationSignal"("escalationRisk");

-- CreateIndex
CREATE INDEX "EpisodeStore_conflictId_idx" ON "EpisodeStore"("conflictId");

-- CreateIndex
CREATE INDEX "EpisodeStore_snapshotAt_idx" ON "EpisodeStore"("snapshotAt");

-- CreateIndex
CREATE INDEX "CalibrationRecord_signalId_idx" ON "CalibrationRecord"("signalId");

-- CreateIndex
CREATE INDEX "CalibrationRecord_computedAt_idx" ON "CalibrationRecord"("computedAt");

-- CreateIndex
CREATE INDEX "CalibrationRecord_resolvedAt_idx" ON "CalibrationRecord"("resolvedAt");

-- CreateIndex
CREATE INDEX "DomainReliability_tier_idx" ON "DomainReliability"("tier");

-- CreateIndex
CREATE INDEX "Event_classified_idx" ON "Event"("classified");

-- AddForeignKey
ALTER TABLE "EscalationSignal" ADD CONSTRAINT "EscalationSignal_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "EpisodeStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "EscalationSignal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
