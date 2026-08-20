-- Add SEASON visibility option
ALTER TYPE "JpcVisibility" ADD VALUE IF NOT EXISTS 'SEASON';

-- Season scope on events (used when visibility = SEASON)
ALTER TABLE "JpcEvent" ADD COLUMN IF NOT EXISTS "seasonId" INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JpcEvent_seasonId_fkey') THEN
    ALTER TABLE "JpcEvent" ADD CONSTRAINT "JpcEvent_seasonId_fkey"
      FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
