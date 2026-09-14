import { prisma } from "./db";
import { nicho } from "@/config/nicho";
import { tokensDeBusca } from "./busca";

/**
 * Garantia do banho — ver `nicho.garantia`.
 *
 * O prazo vem sempre do snapshot gravado em ItemVenda no momento da venda; esta
 * camada só faz a conta de vencimento e a consulta de balcão ("essa peça ainda
 * está na garantia?"). Nada aqui recalcula prazo a partir da configuração atual,
 * porque a garantia de quem já comprou não pode mudar quando o dono mexe no
 * padrão da loja.
 */

/** Soma meses a uma data, prendendo no último dia quando o mês destino é menor. */
export function somarMeses(data: Date, meses: number): Date {
  const resultado = new Date(data.getTime());
  const diaOriginal = resultado.getDate();
  resultado.setMonth(resultado.getMonth() + meses);
  // 31/01 + 1 mês viraria 03/03; prende em 28/02 (ou 29, em ano bissexto).
  if (resultado.getDate() < diaOriginal) resultado.setDate(0);
  return resultado;
}

export type SituacaoGarantia = {
  meses: number;
  validaAte: Date;
  /** Negativo quando já venceu. */
  diasRestantes: number;
  vigente: boolean;
};

const UM_DIA = 24 * 60 * 60 * 1000;

/** Null = item vendido sem garantia (prazo zero ou recurso desligado na época). */
export function situacaoGarantia(
  dataVenda: Date,
  mesesSnapshot: number | null,
  referencia: Date = new Date()
): SituacaoGarantia | null {
  if (mesesSnapshot === null || mesesSnapshot <= 0) return null;

  const validaAte = somarMeses(dataVenda, mesesSnapshot);
  const diasRestantes = Math.ceil((validaAte.getTime() - referencia.getTime()) / UM_DIA);

  return { meses: mesesSnapshot, validaAte, diasRestantes, vigente: diasRestantes >= 0 };
}

export type ItemComGarantia = {
  vendaId: string;
  itemVendaId: string;
  dataVenda: Date;
  clienteNome: string | null;
  produtoNome: string;
  produtoSku: string;
  quantidade: number;
  garantia: SituacaoGarantia | null;
};

/**
 * Consulta de balcão: acha as peças vendidas que casam com o termo — nome ou
 * telefone do cliente, nome/SKU/código de barras da peça, ou o próprio código da
 * venda. Só vendas que não foram canceladas.
 */
export async function consultarGarantias(termo: string, limite = 40): Promise<ItemComGarantia[]> {
  const busca = termo.trim();
  if (!busca) return [];

  const palavras = tokensDeBusca(busca);
  const porPalavra = palavras.map((palavra) => ({
    OR: [
      { produto: { nome: { contains: palavra, mode: "insensitive" as const } } },
      { produto: { sku: { contains: palavra, mode: "insensitive" as const } } },
      { produto: { codigoBarras: { contains: palavra, mode: "insensitive" as const } } },
      { venda: { cliente: { nome: { contains: palavra, mode: "insensitive" as const } } } },
      { venda: { cliente: { telefone: { contains: palavra } } } },
      { vendaId: palavra },
    ],
  }));

  const itens = await prisma.itemVenda.findMany({
    where: {
      venda: { status: { in: ["CONCLUIDA", "DEVOLVIDA_PARCIAL"] } },
      ...(porPalavra.length > 0 ? { AND: porPalavra } : {}),
    },
    include: {
      produto: { select: { nome: true, sku: true } },
      venda: { select: { id: true, dataHora: true, cliente: { select: { nome: true } } } },
    },
    orderBy: { venda: { dataHora: "desc" } },
    take: limite,
  });

  return itens.map((item) => ({
    vendaId: item.venda.id,
    itemVendaId: item.id,
    dataVenda: item.venda.dataHora,
    clienteNome: item.venda.cliente?.nome ?? null,
    produtoNome: item.produto.nome,
    produtoSku: item.produto.sku,
    quantidade: item.quantidade,
    garantia: situacaoGarantia(item.venda.dataHora, item.garantiaMesesSnapshot),
  }));
}

/** Prazo que uma peça teria hoje, para exibir na ficha antes de vender. */
export function garantiaVigenteDaPeca(garantiaMeses: number | null): number | null {
  if (!nicho.garantia.ativo) return null;
  return garantiaMeses ?? nicho.garantia.padraoMeses;
}
