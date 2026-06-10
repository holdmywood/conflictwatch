-- CreateIndex
CREATE INDEX "Event_publishedAt_idx" ON "Event"("publishedAt");

-- CreateIndex
CREATE INDEX "Event_conflictId_publishedAt_idx" ON "Event"("conflictId", "publishedAt");

-- CreateIndex
CREATE INDEX "Event_surpriseScore_idx" ON "Event"("surpriseScore");
