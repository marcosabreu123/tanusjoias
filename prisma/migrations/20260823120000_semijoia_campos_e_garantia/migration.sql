-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "aro" TEXT,
ADD COLUMN     "banho" TEXT,
ADD COLUMN     "comprimentoCm" DOUBLE PRECISION,
ADD COLUMN     "espessuraMilesimos" DOUBLE PRECISION,
ADD COLUMN     "garantiaMeses" INTEGER,
ADD COLUMN     "materialBase" TEXT,
ADD COLUMN     "pedra" TEXT;

-- AlterTable
ALTER TABLE "ItemVenda" ADD COLUMN     "garantiaMesesSnapshot" INTEGER;

-- CreateIndex
CREATE INDEX "Produto_banho_idx" ON "Produto"("banho");

