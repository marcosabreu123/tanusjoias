import { prisma } from "./db";
import { gerarOcorrenciasPendentes } from "./despesas";
import type { Prisma, FormaPagamento } from "@prisma/client";
import { nicho } from "@/config/nicho";

export type ChavePeriodo = "hoje" | "ontem" | "7dias" | "mesAtual" | "mesAnterior" | "custom";
export type Regime = "caixa" | "competencia";

export function resolverPeriodo(chave: ChavePeriodo, custom?: { inicio: Date; fim: Date }): { inicio: Date; fim: Date } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (chave === "hoje") {
    const fim = new Date(hoje);
    fim.setHours(23, 59, 59, 999);
    return { inicio: hoje, fim };
  }
  if (chave === "ontem") {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 1);
    const fim = new Date(inicio);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (chave === "7dias") {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 6);
    const fim = new Date(hoje);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (chave === "mesAtual") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (chave === "mesAnterior") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (!custom) throw new Error("Período customizado requer início e fim.");
  const fim = new Date(custom.fim);
  fim.setHours(23, 59, 59, 999);
  return { inicio: custom.inicio, fim };
}

// Vendas que contam como faturamento válido — mesmo critério de dashboard.ts::lucroBrutoEstimado.
const STATUS_FATURAMENTO_VALIDO = ["CONCLUIDA", "DEVOLVIDA_PARCIAL"] as const;

type ItemComDevolucao = {
  subtotalItem: number;
  custoRealSnapshot: number;
  quantidade: number;
  itensDevolvidos: { quantidade: number }[];
};

// Abate devolução parcial proporcionalmente (receita e custo), arredondando uma única
// vez sobre o total do item — nunca por-unidade-e-somar (mesma técnica já usada em
// compras.ts::receberPedido para o rateio de frete).
function calcularItemLiquido(item: ItemComDevolucao) {
  const quantidadeDevolvida = item.itensDevolvidos.reduce((soma, d) => soma + d.quantidade, 0);
  if (quantidadeDevolvida === 0) {
    return { receitaLiquida: item.subtotalItem, custo: item.custoRealSnapshot * item.quantidade, receitaAbatida: 0 };
  }
  const receitaAbatida = Math.round((item.subtotalItem * quantidadeDevolvida) / item.quantidade);
  const custoAbatido = item.custoRealSnapshot * quantidadeDevolvida;
  return {
    receitaLiquida: item.subtotalItem - receitaAbatida,
    custo: item.custoRealSnapshot * item.quantidade - custoAbatido,
    receitaAbatida,
  };
}

async function somaDespesasOperacionais(periodo: { inicio: Date; fim: Date }, regime: Regime): Promise<number> {
  const where: Prisma.DespesaWhereInput =
    regime === "caixa"
      ? { status: "PAGO", dataPagamento: { gte: periodo.inicio, lte: periodo.fim }, entraNoLucroLiquido: true }
      : { dataDespesa: { gte: periodo.inicio, lte: periodo.fim }, entraNoLucroLiquido: true, status: { not: "CANCELADO" } };

  const resultado = await prisma.despesa.aggregate({ where, _sum: { valor: true } });
  return resultado._sum.valor ?? 0;
}

export type IndicadoresLucro = {
  faturamentoBruto: number;
  descontos: number;
  devolucoes: number;
  faturamentoLiquido: number;
  cmv: number;
  lucroBruto: number;
  /** Retido pela maquininha — sai do que a loja recebe, não do que o cliente paga. */
  taxasCartao: number;
  despesasOperacionais: number;
  lucroLiquido: number;
  margemBruta: number;
  margemLiquida: number;
  ticketMedio: number;
  qtdVendas: number;
}

export async function indicadoresLucro(periodo: { inicio: Date; fim: Date }, regime: Regime): Promise<IndicadoresLucro> {
  await gerarOcorrenciasPendentes();

  const vendas = await prisma.venda.findMany({
    where: { dataHora: { gte: periodo.inicio, lte: periodo.fim }, status: { in: [...STATUS_FATURAMENTO_VALIDO] } },
    select: { subtotal: true, descontoTotal: true, taxaCartaoValor: true, itens: { select: { subtotalItem: true, custoRealSnapshot: true, quantidade: true, itensDevolvidos: { select: { quantidade: true } } } } },
  });

  let faturamentoBruto = 0;
  let descontos = 0;
  let devolucoes = 0;
  let cmv = 0;
  let taxasCartao = 0;

  for (const venda of vendas) {
    faturamentoBruto += venda.subtotal;
    descontos += venda.descontoTotal;
    // A taxa foi calculada sobre o total no momento da venda e não é recalculada
    // em devolução parcial — a adquirente cobra sobre o que passou na máquina.
    taxasCartao += venda.taxaCartaoValor;
    for (const item of venda.itens) {
      const calc = calcularItemLiquido(item);
      devolucoes += calc.receitaAbatida;
      cmv += calc.custo;
    }
  }

  const faturamentoLiquido = faturamentoBruto - descontos - devolucoes;
  const lucroBruto = faturamentoLiquido - cmv;
  const despesasOperacionais = await somaDespesasOperacionais(periodo, regime);
  const lucroLiquido = lucroBruto - taxasCartao - despesasOperacionais;

  const qtdVendas = vendas.length;

  return {
    faturamentoBruto,
    descontos,
    devolucoes,
    faturamentoLiquido,
    cmv,
    lucroBruto,
    taxasCartao,
    despesasOperacionais,
    lucroLiquido,
    margemBruta: faturamentoLiquido > 0 ? (lucroBruto / faturamentoLiquido) * 100 : 0,
    margemLiquida: faturamentoLiquido > 0 ? (lucroLiquido / faturamentoLiquido) * 100 : 0,
    ticketMedio: qtdVendas > 0 ? Math.round(faturamentoLiquido / qtdVendas) : 0,
    qtdVendas,
  };
}

export type LinhaTaxaCartao = {
  chave: string;
  label: string;
  /** Total que passou na máquina nesse parcelamento. */
  faturamento: number;
  taxa: number;
  /** Percentual efetivo do período, já considerando vendas com taxas diferentes. */
  percentualEfetivo: number;
  qtdVendas: number;
};

/**
 * Quanto a maquininha reteve em cada parcelamento no período — é a resposta para
 * "vale a pena continuar parcelando em 6x?".
 */
export async function taxasCartaoPorParcelamento(periodo: {
  inicio: Date;
  fim: Date;
}): Promise<LinhaTaxaCartao[]> {
  const vendas = await prisma.venda.findMany({
    where: {
      dataHora: { gte: periodo.inicio, lte: periodo.fim },
      status: { in: [...STATUS_FATURAMENTO_VALIDO] },
      formaPagamento: { in: ["CARTAO_CREDITO", "CARTAO_DEBITO"] },
    },
    select: { formaPagamento: true, parcelas: true, total: true, taxaCartaoValor: true },
  });

  const mapa = new Map<string, { label: string; faturamento: number; taxa: number; qtdVendas: number }>();

  for (const venda of vendas) {
    const chave = `${venda.formaPagamento}:${venda.parcelas}`;
    const label =
      venda.formaPagamento === "CARTAO_DEBITO"
        ? "Débito"
        : venda.parcelas <= 1
          ? "Crédito à vista"
          : `Crédito ${venda.parcelas}x`;

    const atual = mapa.get(chave) ?? { label, faturamento: 0, taxa: 0, qtdVendas: 0 };
    atual.faturamento += venda.total;
    atual.taxa += venda.taxaCartaoValor;
    atual.qtdVendas += 1;
    mapa.set(chave, atual);
  }

  return Array.from(mapa.entries())
    .map(([chave, linha]) => ({
      chave,
      label: linha.label,
      faturamento: linha.faturamento,
      taxa: linha.taxa,
      percentualEfetivo: linha.faturamento > 0 ? (linha.taxa / linha.faturamento) * 100 : 0,
      qtdVendas: linha.qtdVendas,
    }))
    .sort((a, b) => b.taxa - a.taxa);
}

export const LABEL_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
};

export type AgrupamentoLucro = "produto" | "categoria" | "marca" | "tipoVenda" | "formaPagamento" | "vendedor" | "dia" | "semana" | "mes";

export type LinhaDetalhamento = {
  chave: string;
  label: string;
  faturamento: number;
  custo: number;
  lucroBruto: number;
  margem: number;
  quantidade: number;
};

const AGRUPAMENTOS_POR_VENDA: AgrupamentoLucro[] = ["formaPagamento", "vendedor", "dia", "semana", "mes"];

function inicioDaSemana(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  copia.setDate(copia.getDate() - copia.getDay());
  return copia;
}

// Detalhamento por produto/categoria/marca/tipo é feito por item (um item pode virar
// mais de uma linha só se comprado com descontos diferentes, o que não acontece aqui).
// Detalhamento por forma de pagamento/vendedor/dia/semana/mês é feito por venda inteira,
// já que esses atributos só existem no nível da venda, não do item — o desconto geral
// da venda (venda.descontoTotal) é abatido inteiro na linha correspondente, sem
// rateá-lo entre produtos (simplificação deliberada: descontoTotal é um valor de
// carrinho, não de item).
export async function detalhamentoLucro(periodo: { inicio: Date; fim: Date }, agrupamento: AgrupamentoLucro): Promise<LinhaDetalhamento[]> {
  const vendas = await prisma.venda.findMany({
    where: { dataHora: { gte: periodo.inicio, lte: periodo.fim }, status: { in: [...STATUS_FATURAMENTO_VALIDO] } },
    include: {
      usuario: true,
      itens: { include: { itensDevolvidos: true, produto: true } },
    },
  });

  const mapa = new Map<string, { label: string; faturamento: number; custo: number; quantidade: number }>();

  function acumular(chave: string, label: string, faturamento: number, custo: number, quantidade: number) {
    const atual = mapa.get(chave) ?? { label, faturamento: 0, custo: 0, quantidade: 0 };
    atual.faturamento += faturamento;
    atual.custo += custo;
    atual.quantidade += quantidade;
    mapa.set(chave, atual);
  }

  for (const venda of vendas) {
    if (AGRUPAMENTOS_POR_VENDA.includes(agrupamento)) {
      let faturamentoVenda = 0;
      let custoVenda = 0;
      let quantidadeVenda = 0;
      for (const item of venda.itens) {
        const calc = calcularItemLiquido(item);
        faturamentoVenda += calc.receitaLiquida;
        custoVenda += calc.custo;
        quantidadeVenda += item.quantidade - item.itensDevolvidos.reduce((soma, d) => soma + d.quantidade, 0);
      }
      faturamentoVenda -= venda.descontoTotal;

      let chave: string;
      let label: string;
      if (agrupamento === "formaPagamento") {
        chave = venda.formaPagamento;
        label = LABEL_FORMA_PAGAMENTO[venda.formaPagamento];
      } else if (agrupamento === "vendedor") {
        chave = venda.usuarioId;
        label = venda.usuario.nome;
      } else if (agrupamento === "dia") {
        chave = venda.dataHora.toISOString().slice(0, 10);
        label = venda.dataHora.toLocaleDateString("pt-BR");
      } else if (agrupamento === "semana") {
        const inicio = inicioDaSemana(venda.dataHora);
        chave = inicio.toISOString().slice(0, 10);
        label = `Semana de ${inicio.toLocaleDateString("pt-BR")}`;
      } else {
        chave = `${venda.dataHora.getFullYear()}-${String(venda.dataHora.getMonth() + 1).padStart(2, "0")}`;
        label = venda.dataHora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      }
      acumular(chave, label, faturamentoVenda, custoVenda, quantidadeVenda);
    } else {
      for (const item of venda.itens) {
        const calc = calcularItemLiquido(item);
        const quantidadeLiquida = item.quantidade - item.itensDevolvidos.reduce((soma, d) => soma + d.quantidade, 0);

        let chave: string;
        let label: string;
        if (agrupamento === "produto") {
          chave = item.produtoId;
          label = item.produto.nome;
        } else if (agrupamento === "categoria") {
          chave = item.produto.categoria;
          label = item.produto.categoria;
        } else if (agrupamento === "marca") {
          chave = item.produto.marca;
          label = item.produto.marca;
        } else {
          chave = item.produto.tipoVenda;
          label = item.produto.tipoVenda === "FRACIONADO" ? nicho.estoque.vendaFracionada.rotulo : "Unidade fechada";
        }
        acumular(chave, label, calc.receitaLiquida, calc.custo, quantidadeLiquida);
      }
    }
  }

  return Array.from(mapa.entries())
    .map(([chave, linha]) => ({
      chave,
      label: linha.label,
      faturamento: linha.faturamento,
      custo: linha.custo,
      lucroBruto: linha.faturamento - linha.custo,
      margem: linha.faturamento > 0 ? ((linha.faturamento - linha.custo) / linha.faturamento) * 100 : 0,
      quantidade: linha.quantidade,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);
}
