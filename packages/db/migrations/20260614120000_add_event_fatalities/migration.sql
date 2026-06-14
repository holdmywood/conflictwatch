-- Add fatality count to Event (UCDP `best` estimate; 0 for sources without
-- fatality data). Drives lethality-weighted threat intensity. Additive,
-- non-destructive: existing rows default to 0.
ALTER TABLE "Event" ADD COLUMN "fatalities" INTEGER NOT NULL DEFAULT 0;
