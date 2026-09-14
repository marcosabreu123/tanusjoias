import Link from "next/link";
import { requireLeitura } from "@/lib/permissoes-servidor";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { consultarGarantias } from "@/lib/garantia";
import { nicho } from "@/config/nicho";

const formatarData = (data: Date) =>
  data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Consulta de balcão: a cliente volta com a peça escurecida e quer saber se
 * ainda está na garantia. Procura por nome/telefone da cliente, nome ou SKU da
 * peça, ou o código da venda.
 */
export default async function GarantiaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const usuario = await requireLeitura("vendas");
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  const itens = termo ? await consultarGarantias(termo) : [];

  return (
    <AppShell usuario={usuario}>
      <PageHeader title={nicho.garantia.rotulo} />

      <form method="get" className="card mb-6 flex flex-col gap-3 p-5 sm:flex-row">
        <input
          name="q"
          defaultValue={termo}
          className="input flex-1"
          placeholder="Nome ou telefone da cliente, nome da peça, SKU..."
          aria-label="Buscar peça vendida"
        />
        <button type="submit" className="btn btn-primary">
          Consultar
        </button>
      </form>

      {!termo ? (
        <p className="state-empty">
          Busque pela cliente ou pela peça para ver se a compra ainda está dentro da garantia.
        </p>
      ) : itens.length === 0 ? (
        <p className="state-empty">Nenhuma venda encontrada para “{termo}”.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((item) => {
            const g = item.garantia;
            return (
              <li key={item.itemVendaId}>
                <Link
                  href={`/vendas/${item.vendaId}`}
                  className="card card-interactive flex items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.produtoNome}</p>
                    <p className="truncate text-sm" style={{ color: "var(--muted)" }}>
                      {item.produtoSku} · {item.clienteNome ?? "sem cliente"} ·{" "}
                      {formatarData(item.dataVenda)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {g === null ? (
                      <span className="badge">Sem garantia</span>
                    ) : g.vigente ? (
                      <>
                        <span className="badge badge-success">Na garantia</span>
                        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                          até {formatarData(g.validaAte)} ({g.diasRestantes} dia
                          {g.diasRestantes === 1 ? "" : "s"})
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="badge badge-danger">Vencida</span>
                        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                          venceu em {formatarData(g.validaAte)}
                        </p>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
        {nicho.garantia.textoComprovante}
      </p>
    </AppShell>
  );
}
