-- CreateTable
CREATE TABLE "Situation" (
    "id" TEXT NOT NULL,
    "conflictId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'emerging',
    "location" TEXT NOT NULL,
    "actors" TEXT[],
    "cameoRoots" TEXT[],
    "eventIds" TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Situation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Situation_conflictId_idx" ON "Situation"("conflictId");

-- CreateIndex
CREATE INDEX "Situation_status_idx" ON "Situation"("status");

-- CreateIndex
CREATE INDEX "Situation_lastSeenAt_idx" ON "Situation"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "Situation" ADD CONSTRAINT "Situation_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "Conflict"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
