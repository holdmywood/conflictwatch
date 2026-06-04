-- AddUniqueConstraint
CREATE UNIQUE INDEX "EventSource_eventId_url_key" ON "EventSource"("eventId", "url");
