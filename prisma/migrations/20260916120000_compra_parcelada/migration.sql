-- AlterTable
ALTER TABLE "PedidoDeCompra" ADD COLUMN     "formaPagamentoCompra" "FormaPagamentoDespesa",
ADD COLUMN     "parcelas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "primeiroVencimento" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Despesa" ADD COLUMN     "numeroParcela" INTEGER,
ADD COLUMN     "pedidoCompraId" TEXT;

-- CreateIndex
CREATE INDEX "Despesa_pedidoCompraId_idx" ON "Despesa"("pedidoCompraId");

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoDeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

