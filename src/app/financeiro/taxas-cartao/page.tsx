import { requireOwner } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { listarTaxasCartao, bpsParaPercentual } from "@/lib/taxasCartao";
import { LABEL_FORMA_PAGAMENTO } from "@/lib/lucro";
import { TaxaCartaoForm } from "./TaxaCartaoForm";
import { removerTaxaCartaoAction } from "./actions";

export default async function TaxasCartaoPage() {
  const usuario = await requireOwner();
  const taxas = await listarTaxasCartao();

  return (
    <AppShell usuario={usuario}>
      <PageHeader title="Taxas do cartão" />

      <div className="card mb-6 p-6 text-sm" style={{ color: "var(--muted)" }}>
        <p className="mb-2">
          A taxa da maquininha <strong>não é cobrada do cliente</strong> — ele paga o total da
          venda do mesmo jeito. Ela sai do que a loja recebe, e por isso aparece como uma linha
          própria no relatório de lucro.
        </p>
        <p>
          Cada venda guarda a taxa que valia no dia. Renegociar com a adquirente muda daqui para a
          frente e não reescreve o lucro dos meses anteriores.
        </p>
      </div>

      <TaxaCartaoForm />

      <h2 className="label-caps mb-3 mt-8">Taxas cadastradas</h2>

      {taxas.length === 0 ? (
        <p className="state-empty">
          Nenhuma taxa cadastrada. Enquanto estiver assim, vendas no cartão entram no lucro como se
          a maquininha não cobrasse nada.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {taxas.map((taxa) => (
            <li key={taxa.id} className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {LABEL_FORMA_PAGAMENTO[taxa.formaPagamento]}
                  {taxa.formaPagamento === "CARTAO_CREDITO" &&
                    (taxa.parcelas <= 1 ? " · à vista" : ` · ${taxa.parcelas}x`)}
                </p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Retém {bpsParaPercentual(taxa.percentualBps)}% de cada venda
                </p>
              </div>

              <form action={removerTaxaCartaoAction.bind(null, taxa.id)}>
                <button type="submit" className="label-caps" style={{ color: "var(--danger)" }}>
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
