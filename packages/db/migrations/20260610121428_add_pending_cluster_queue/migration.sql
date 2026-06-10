-- CreateTable
CREATE TABLE "PendingCluster" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingCluster_clusterId_key" ON "PendingCluster"("clusterId");

-- CreateIndex
CREATE INDEX "PendingCluster_firstSeenAt_idx" ON "PendingCluster"("firstSeenAt");
