-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "opponentDeckVersionId" TEXT;

-- CreateTable
CREATE TABLE "OpponentDeckVersion" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "leaderId" TEXT,
    "baseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpponentDeckVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpponentDeckCard" (
    "id" TEXT NOT NULL,
    "opponentDeckVersionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "slot" TEXT NOT NULL DEFAULT 'main',

    CONSTRAINT "OpponentDeckCard_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_opponentDeckVersionId_fkey" FOREIGN KEY ("opponentDeckVersionId") REFERENCES "OpponentDeckVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentDeckCard" ADD CONSTRAINT "OpponentDeckCard_opponentDeckVersionId_fkey" FOREIGN KEY ("opponentDeckVersionId") REFERENCES "OpponentDeckVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
