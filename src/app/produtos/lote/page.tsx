import Link from "next/link";
import { requireEscrita } from "@/lib/permissoes-servidor";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { LancamentoLoteForm } from "@/components/LancamentoLoteForm";
import { listarFornecedores } from "@/lib/fornecedores";
import { nicho } from "@/config/nicho";

export default async function LancamentoLotePage() {
  const usuario = await requireEscrita("produtos");
  const fornecedores = await listarFornecedores();

  return (
    <AppShell usuario={usuario} wide>
      <PageHeader title="Lançamento em lote" />

      <div className="card mb-6 p-6 text-sm" style={{ color: "var(--muted)" }}>
        <p className="mb-2">
          Cole a lista do fornecedor ou anexe o PDF/foto dela. A IA monta uma prévia com as{" "}
          {nicho.termos.produto.plural.toLowerCase()}, você corrige o que estiver errado e só então
          confirma.
        </p>
        <p className="mb-2">
          Ao confirmar, cada peça é cadastrada (ou atualizada, se o SKU já existir) e tudo que tiver
          quantidade e custo entra no estoque numa única entrada, com o frete rateado por unidade.
        </p>
        <p>
          Prefere planilha? Use a{" "}
          <Link href="/ferramentas/importar" style={{ color: "var(--accent)" }}>
            importação por CSV
          </Link>
          .
        </p>
      </div>

      <LancamentoLoteForm fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))} />
    </AppShell>
  );
}
