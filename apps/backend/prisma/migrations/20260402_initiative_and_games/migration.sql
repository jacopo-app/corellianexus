-- Drop old enum and column
ALTER TABLE "Match" DROP COLUMN IF EXISTS "coin";
DROP TYPE IF EXISTS "CoinResult";

-- Create new enum
CREATE TYPE "Initiative" AS ENUM ('first', 'second');

-- Add new columns
ALTER TABLE "Match" ADD COLUMN "initiative" "Initiative";
ALTER TABLE "Match" ADD COLUMN "games" TEXT[] NOT NULL DEFAULT '{}';
