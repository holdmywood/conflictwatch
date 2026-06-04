-- AddUniqueConstraint on ExposureLink(zone, instrument)
CREATE UNIQUE INDEX "ExposureLink_zone_instrument_key" ON "ExposureLink"("zone", "instrument");
