-- CreateTable
CREATE TABLE "ExposureLink" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "zoneLabel" TEXT NOT NULL,
    "zoneType" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "instrumentLabel" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExposureLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExposureLink_zone_idx" ON "ExposureLink"("zone");

-- CreateIndex
CREATE INDEX "ExposureLink_instrument_idx" ON "ExposureLink"("instrument");
