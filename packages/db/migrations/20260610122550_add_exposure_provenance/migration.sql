-- AlterTable
ALTER TABLE "ExposureLink" ADD COLUMN     "addedBy" TEXT NOT NULL DEFAULT 'seed',
ADD COLUMN     "provenance" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExposureLink_reviewStatus_idx" ON "ExposureLink"("reviewStatus");
