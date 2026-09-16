import { prisma } from "./db";
import type { FormaPagamentoDespesa, StatusPedido, Prisma } from "@prisma/client";
import { somarMeses } from "./garantia";
import { dividirEmParcelas, MAX_PARCELAS_COMPRA } from "./parcelas";

export { dividirEmParcelas, MAX_PARCELAS_COMPRA };

export class ErroCompra extends Error {}

export type ItemPedidoEntrada = {
  produtoId: string;
  quantidade: number;
  quantidadeDemonstracao?: number;
  custoUnitario: number; // centavos, sem frete
};

export type DadosPedido = {
  fornecedorId: string;
  itens: ItemPedidoEntrada[];
  valorFrete?: number; // centavos
  observacoes?: string | null;
  /** 1 = à vista. Acima disso vira carnê em contas a pagar ao enviar o pedido. */
  parcelas?: number;
  /** Vencimento da 1ª parcela; as seguintes caem de mês em mês. */
  primeiroVencimento?: Date | null;
  formaPagamentoCompra?: FormaPagamentoDespesa | null;
};

/** Nome da categoria de despesa usada pelas parcelas de compra. */
export const CATEGORIA_COMPRA = "Compra de mercadoria";

/** Valor total do pedido: itens (venda + demonstração) mais o frete. */
export function totalDoPedido(pedido: {
  valorFrete: number;
  itens: Array<{ custoUnitario: number; quantidade: number; quantidadeDemonstracao: number }>;
}): number {
  const itens = pedido.itens.reduce(
    (soma, item) => soma + item.custoUnitario * (item.quantidade + item.quantidadeDemonstracao),
    0
  );
  return itens + pedido.valorFrete;
}

async function categoriaDeCompra(tx: Prisma.TransactionClient): Promise<string> {
  const existente = await tx.categoriaDespesa.findFirst({ where: { nome: CATEGORIA_COMPRA } });
  if (existente) return existente.id;
  const criada = await tx.categoriaDespesa.create({
    data: { nome: CATEGORIA_COMPRA, padrao: true },
  });
  return criada.id;
}

/**
 * Transforma o pedido no carnê da compra: uma despesa por parcela, vencendo de
 * mês em mês, já dentro de contas a pagar.
 *
 * REGRA CENTRAL — estas despesas nascem com `entraNoLucroLiquido: false`.
 * O custo da mercadoria já entra no lucro como CMV no momento em que a peça é
 * vendida (via `custoRealSnapshot` em ItemVenda). Se a parcela também entrasse
 * como despesa operacional, o mesmo dinheiro seria subtraído duas vezes e o
 * lucro apareceria menor do que é — silenciosamente, porque nada acusaria.
 *
 * Elas continuam aparecendo normalmente em Despesas, no vencimento e no
 * relatório de despesas: nenhum desses filtra por `entraNoLucroLiquido`. Só o
 * relatório de lucro filtra, que é exatamente onde elas não podem entrar.
 */
async function gerarParcelasDoPedido(
  tx: Prisma.TransactionClient,
  pedidoId: string,
  usuarioId: string
): Promise<number> {
  const pedido = await tx.pedidoDeCompra.findUnique({
    where: { id: pedidoId },
    include: { itens: true, fornecedor: true },
  });
  if (!pedido) throw new ErroCompra("Pedido não encontrado.");

  const total = totalDoPedido(pedido);
  if (total <= 0) return 0;

  const quantidade = Math.max(1, Math.min(pedido.parcelas, MAX_PARCELAS_COMPRA));
  const valores = dividirEmParcelas(total, quantidade);
  const categoriaId = await categoriaDeCompra(tx);
  const primeiro = pedido.primeiroVencimento ?? new Date();
  const referencia = pedido.id.slice(-6).toUpperCase();

  for (const [indice, valor] of valores.entries()) {
    const vencimento = somarMeses(primeiro, indice);
    await tx.despesa.create({
      data: {
        descricao:
          quantidade > 1
            ? `Compra ${referencia} — ${pedido.fornecedor.nome} (${indice + 1}/${quantidade})`
            : `Compra ${referencia} — ${pedido.fornecedor.nome}`,
        categoriaId,
        fornecedorId: pedido.fornecedorId,
        valor,
        // Competência na data do pedido, vencimento na data da parcela: é o que
        // faz a conta cair no mês certo em contas a pagar.
        dataDespesa: vencimento,
        vencimento,
        formaPagamento: pedido.formaPagamentoCompra,
        classificacao: "VARIAVEL",
        entraNoLucroLiquido: false,
        pedidoCompraId: pedido.id,
        numeroParcela: indice + 1,
        usuarioId,
      },
    });
  }

  return valores.length;
}

function validarItens(itens: ItemPedidoEntrada[]) {
  if (itens.length === 0) {
    throw new ErroCompra("Adicione ao menos um item ao pedido.");
  }
  for (const item of itens) {
    if (item.quantidade <= 0) {
      throw new ErroCompra("Quantidade inválida em um dos itens do pedido.");
    }
    if (item.custoUnitario <= 0) {
      throw new ErroCompra("Custo unitário inválido em um dos itens do pedido.");
    }
  }
}

export async function criarPedido(dados: DadosPedido) {
  validarItens(dados.itens);

  return prisma.pedidoDeCompra.create({
    data: {
      fornecedorId: dados.fornecedorId,
      valorFrete: dados.valorFrete ?? 0,
      observacoes: dados.observacoes?.trim() || null,
      parcelas: Math.max(1, Math.min(dados.parcelas ?? 1, MAX_PARCELAS_COMPRA)),
      primeiroVencimento: dados.primeiroVencimento ?? null,
      formaPagamentoCompra: dados.formaPagamentoCompra ?? null,
      itens: {
        create: dados.itens.map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          quantidadeDemonstracao: item.quantidadeDemonstracao ?? 0,
          custoUnitario: item.custoUnitario,
        })),
      },
    },
    include: { itens: true },
  });
}

export async function atualizarPedido(id: string, dados: DadosPedido) {
  validarItens(dados.itens);

  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoDeCompra.findUnique({ where: { id } });
    if (!pedido) {
      throw new ErroCompra("Pedido não encontrado.");
    }
    if (pedido.status !== "RASCUNHO") {
      throw new ErroCompra("Só é possível editar pedidos em rascunho.");
    }

    await tx.itemPedidoDeCompra.deleteMany({ where: { pedidoCompraId: id } });

    return tx.pedidoDeCompra.update({
      where: { id },
      data: {
        fornecedorId: dados.fornecedorId,
        valorFrete: dados.valorFrete ?? 0,
        observacoes: dados.observacoes?.trim() || null,
        parcelas: Math.max(1, Math.min(dados.parcelas ?? 1, MAX_PARCELAS_COMPRA)),
        primeiroVencimento: dados.primeiroVencimento ?? null,
        formaPagamentoCompra: dados.formaPagamentoCompra ?? null,
        itens: {
          create: dados.itens.map((item) => ({
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            quantidadeDemonstracao: item.quantidadeDemonstracao ?? 0,
            custoUnitario: item.custoUnitario,
          })),
        },
      },
      include: { itens: true },
    });
  });
}

/**
 * Enviar é o momento em que a compra vira compromisso — e por isso é aqui que
 * as parcelas entram em contas a pagar, não na criação: rascunho ainda pode ser
 * editado, e gerar conta a pagar de rascunho deixaria cobrança órfã no sistema.
 */
export async function enviarPedido(id: string, usuarioId: string) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoDeCompra.findUnique({ where: { id } });
    if (!pedido) {
      throw new ErroCompra("Pedido não encontrado.");
    }
    if (pedido.status !== "RASCUNHO") {
      throw new ErroCompra('Só é possível enviar pedidos em rascunho.');
    }

    const parcelasCriadas = await gerarParcelasDoPedido(tx, id, usuarioId);
    const atualizado = await tx.pedidoDeCompra.update({
      where: { id },
      data: { status: "ENVIADO" },
    });
    return { pedido: atualizado, parcelasCriadas };
  });
}

export async function cancelarPedido(id: string, usuarioId: string, motivo?: string) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoDeCompra.findUnique({ where: { id } });
    if (!pedido) {
      throw new ErroCompra("Pedido não encontrado.");
    }
    if (pedido.status === "RECEBIDO") {
      throw new ErroCompra("Um pedido já recebido não pode ser cancelado.");
    }
    if (pedido.status === "CANCELADO") {
      throw new ErroCompra("Este pedido já foi cancelado.");
    }

    // Parcela já paga NÃO é mexida: o dinheiro saiu de verdade, e apagar isso
    // falsearia o caixa. Só as em aberto são canceladas.
    const canceladas = await tx.despesa.updateMany({
      where: { pedidoCompraId: id, status: "PENDENTE" },
      data: {
        status: "CANCELADO",
        canceladoPorId: usuarioId,
        canceladoEm: new Date(),
        motivoCancelamento: motivo?.trim() || "Pedido de compra cancelado.",
      },
    });

    const atualizado = await tx.pedidoDeCompra.update({
      where: { id },
      data: { status: "CANCELADO" },
    });
    return { pedido: atualizado, parcelasCanceladas: canceladas.count };
  });
}

export type DadosRecebimentoItem = {
  itemPedidoId: string;
  numeroLote: string;
  dataValidade?: Date | null;
};

// Rateio de frete proporcional ao valor de custo de cada item (custoUnitario * quantidade total do item),
// com correção de arredondamento no último item para que a soma bata exatamente com o valor de frete informado.
export async function receberPedido(params: {
  pedidoId: string;
  usuarioId: string;
  itens: DadosRecebimentoItem[];
}) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoDeCompra.findUnique({
      where: { id: params.pedidoId },
      include: { itens: true },
    });
    if (!pedido) {
      throw new ErroCompra("Pedido não encontrado.");
    }
    if (pedido.status !== "ENVIADO") {
      throw new ErroCompra('Só é possível receber pedidos com status "Enviado".');
    }
    if (params.itens.length !== pedido.itens.length) {
      throw new ErroCompra("Informe o lote de recebimento para todos os itens do pedido.");
    }

    const basePorItem = new Map(
      pedido.itens.map((item) => [item.id, item.custoUnitario * (item.quantidade + item.quantidadeDemonstracao)])
    );
    const baseTotal = [...basePorItem.values()].reduce((soma, valor) => soma + valor, 0);

    const freteTotalPorItem = new Map<string, number>();
    if (pedido.valorFrete > 0 && baseTotal > 0) {
      let freteDistribuido = 0;
      pedido.itens.forEach((item, indice) => {
        const ehUltimo = indice === pedido.itens.length - 1;
        const base = basePorItem.get(item.id) ?? 0;
        const frete = ehUltimo ? pedido.valorFrete - freteDistribuido : Math.round((pedido.valorFrete * base) / baseTotal);
        freteDistribuido += frete;
        freteTotalPorItem.set(item.id, frete);
      });
    } else {
      pedido.itens.forEach((item) => freteTotalPorItem.set(item.id, 0));
    }

    for (const itemPedido of pedido.itens) {
      const recebimento = params.itens.find((item) => item.itemPedidoId === itemPedido.id);
      if (!recebimento || !recebimento.numeroLote.trim()) {
        throw new ErroCompra("Informe o número do lote para cada item recebido.");
      }

      const quantidadeTotal = itemPedido.quantidade + itemPedido.quantidadeDemonstracao;
      const freteItemTotal = freteTotalPorItem.get(itemPedido.id) ?? 0;
      const freteRateado = quantidadeTotal > 0 ? Math.round(freteItemTotal / quantidadeTotal) : 0;
      const custoReal = itemPedido.custoUnitario + freteRateado;

      const lote = await tx.lote.create({
        data: {
          produtoId: itemPedido.produtoId,
          numero: recebimento.numeroLote.trim(),
          dataValidade: recebimento.dataValidade ?? null,
          custoUnitario: itemPedido.custoUnitario,
          freteRateado,
          custoReal,
          quantidadeInicialVenda: itemPedido.quantidade,
          quantidadeAtualVenda: itemPedido.quantidade,
          quantidadeInicialDemonstracao: itemPedido.quantidadeDemonstracao,
          quantidadeAtualDemonstracao: itemPedido.quantidadeDemonstracao,
          itemPedidoId: itemPedido.id,
          status: "ATIVO",
        },
      });

      if (itemPedido.quantidade > 0) {
        await tx.movimentacaoEstoque.create({
          data: {
            produtoId: itemPedido.produtoId,
            loteId: lote.id,
            tipo: "ENTRADA_COMPRA",
            pool: "VENDA",
            quantidade: itemPedido.quantidade,
            usuarioId: params.usuarioId,
            pedidoCompraId: pedido.id,
          },
        });
      }

      if (itemPedido.quantidadeDemonstracao > 0) {
        await tx.movimentacaoEstoque.create({
          data: {
            produtoId: itemPedido.produtoId,
            loteId: lote.id,
            tipo: "ENTRADA_COMPRA",
            pool: "DEMONSTRACAO",
            quantidade: itemPedido.quantidadeDemonstracao,
            usuarioId: params.usuarioId,
            pedidoCompraId: pedido.id,
          },
        });
      }
    }

    return tx.pedidoDeCompra.update({
      where: { id: pedido.id },
      data: { status: "RECEBIDO", dataRecebimento: new Date() },
    });
  });
}

export async function buscarPedidoPorId(id: string) {
  return prisma.pedidoDeCompra.findUnique({
    where: { id },
    include: {
      fornecedor: true,
      itens: { include: { produto: true, lote: true } },
      movimentacoes: { include: { usuario: true }, orderBy: { createdAt: "asc" } },
      parcelasDespesa: { orderBy: { numeroParcela: "asc" } },
    },
  });
}

export type FiltrosPedidos = {
  status?: StatusPedido;
  fornecedorId?: string;
  dataInicio?: Date;
  dataFim?: Date;
  busca?: string;
  pagina?: number;
  porPagina?: number;
};

export async function listarPedidos(filtros: FiltrosPedidos = {}) {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const porPagina = filtros.porPagina ?? 20;
  const buscaLimpa = filtros.busca?.trim();

  const where: Prisma.PedidoDeCompraWhereInput = {
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.fornecedorId ? { fornecedorId: filtros.fornecedorId } : {}),
    ...(filtros.dataInicio || filtros.dataFim
      ? { dataPedido: { gte: filtros.dataInicio, lte: filtros.dataFim } }
      : {}),
    ...(buscaLimpa
      ? {
          OR: [
            { id: { contains: buscaLimpa } },
            { fornecedor: { nome: { contains: buscaLimpa, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [pedidos, total] = await Promise.all([
    prisma.pedidoDeCompra.findMany({
      where,
      include: { fornecedor: true, itens: true },
      orderBy: { dataPedido: "desc" },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.pedidoDeCompra.count({ where }),
  ]);

  return { pedidos, total, pagina, porPagina, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) };
}

export async function contarPedidosEmAberto() {
  return prisma.pedidoDeCompra.count({ where: { status: { in: ["RASCUNHO", "ENVIADO"] } } });
}

export async function resumoComprasMes() {
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);

  const recebidos = await prisma.pedidoDeCompra.findMany({
    where: { status: "RECEBIDO", dataRecebimento: { gte: inicio } },
    include: { itens: true },
  });

  const valorTotal = recebidos.reduce(
    (soma, pedido) =>
      soma +
      pedido.itens.reduce((s, item) => s + item.custoUnitario * (item.quantidade + item.quantidadeDemonstracao), 0) +
      pedido.valorFrete,
    0
  );

  return { quantidadeRecebidos: recebidos.length, valorTotal };
}
