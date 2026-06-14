-- State belligerents (FIPS codes from UCDP side_a/side_b governments). Lets a
-- country at war on foreign soil inherit the conflict's threat. Additive,
-- non-destructive: existing rows default to an empty array.
ALTER TABLE "Event" ADD COLUMN "belligerents" TEXT[] NOT NULL DEFAULT '{}'::text[];
