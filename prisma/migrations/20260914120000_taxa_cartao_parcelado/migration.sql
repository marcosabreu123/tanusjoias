-- AlterTable
ALTER TABLE "Venda" ADD COLUMN     "parcelas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "taxaCartaoBpsSnapshot" INTEGER,
ADD COLUMN     "taxaCartaoValor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TaxaCartao" (
    "id" TEXT NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "percentualBps" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxaCartao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxaCartao_formaPagamento_parcelas_key" ON "TaxaCartao"("formaPagamento", "parcelas");

