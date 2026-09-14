import { prisma } from "@/lib/db";
import {
  atualizarProduto,
  buscarProdutoPorSku,
  criarProduto,
  marcaOuPadrao,
  type DadosProduto,
} from "@/lib/produtos";
import { registrarEntradaEstoque } from "@/lib/entradaEstoque";
import { reaisParaCentavos } from "@/lib/money";
import { nicho } from "@/config/nicho";
import type { LinhaLote } from "./interpretar";
import { ErroLote } from "./interpretar";

/**
 * Aplica a prévia do lançamento em lote: cadastra/atualiza as peças e, em
 * seguida, dá uma única entrada de estoque com tudo que veio com quantidade e
 * custo. É o passo que grava — só chamado depois da confirmação explícita.
 */

export type ResultadoLote = {
  criados: number;
  atualizados: number;
  entradaEstoqueId: string | null;
  unidadesEmEstoque: number;
  avisos: string[];
};

/** "Colar" → "COL". Base do SKU gerado quando a lista não traz referência. */
function prefixoDaCategoria(categoria: string): string {
  const limpo = categoria
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return (limpo.slice(0, 3) || "PEC").padEnd(3, "X");
}

/**
 * Gera SKUs sequenciais por categoria (COL-0001, COL-0002...). `reservados`
 * segura os que já foram entregues nesta mesma execução, já que nenhum deles
 * está no banco ainda.
 */
async function criarGeradorDeSku(reservados: Set<string>) {
  const ultimoPorPrefixo = new Map<string, number>();

  return async function proximoSku(categoria: string): Promise<string> {
    const prefixo = prefixoDaCategoria(categoria);

    if (!ultimoPorPrefixo.has(prefixo)) {
      const existentes = await prisma.produto.findMany({
        where: { sku: { startsWith: `${prefixo}-` } },
        select: { sku: true },
      });
      const maior = existentes.reduce((maximo, { sku }) => {
        const numero = Number(sku.slice(prefixo.length + 1));
        return Number.isFinite(numero) && numero > maximo ? numero : maximo;
      }, 0);
      ultimoPorPrefixo.set(prefixo, maior);
    }

    let numero = ultimoPorPrefixo.get(prefixo) ?? 0;
    let sku: string;
    do {
      numero += 1;
      sku = `${prefixo}-${String(numero).padStart(4, "0")}`;
    } while (reservados.has(sku));

    ultimoPorPrefixo.set(prefixo, numero);
    reservados.add(sku);
    return sku;
  };
}

export type DadosAplicacaoLote = {
  linhas: LinhaLote[];
  fornecedorId: string | null;
  /** Centavos — rateado uniformemente entre as unidades da entrada. */
  valorFrete: number;
  dataEntrada: Date;
  observacoes: string | null;
  usuarioId: string;
};

export async function aplicarLote(dados: DadosAplicacaoLote): Promise<ResultadoLote> {
  if (dados.linhas.length === 0) {
    throw new ErroLote("Nenhuma peça para lançar.");
  }

  const avisos: string[] = [];
  const reservados = new Set<string>();
  const proximoSku = await criarGeradorDeSku(reservados);

  let criados = 0;
  let atualizados = 0;
  const itensEntrada: Array<{ produtoId: string; quantidade: number; custoUnitario: number }> = [];

  for (const [indice, linha] of dados.linhas.entries()) {
    const referencia = `Linha ${indice + 1} (${linha.nome})`;

    const precoVenda = reaisParaCentavos(linha.precoVenda ?? 0);
    if (precoVenda <= 0) {
      avisos.push(`${referencia}: sem preço de venda — não cadastrada.`);
      continue;
    }

    const categoria = (linha.categoria ?? "").trim() || nicho.categoriasProdutoIniciais[0] || "Geral";
    const sku = (linha.sku ?? "").trim() || (await proximoSku(categoria));
    const precoCustoRef = reaisParaCentavos(linha.precoCusto ?? 0);

    const produto: DadosProduto = {
      nome: linha.nome,
      marca: marcaOuPadrao(null),
      categoria,
      medida: null,
      sku,
      codigoBarras: null,
      precoCustoRef,
      precoVenda,
      fornecedorId: dados.fornecedorId,
      atributoA: null,
      atributoB: linha.publico,
      banho: linha.banho,
      espessuraMilesimos: linha.espessura,
      comprimentoCm: linha.comprimentoCm,
      aro: linha.aro,
      materialBase: linha.materialBase,
      pedra: linha.pedra,
      garantiaMeses: null,
      tipoVenda: "UNIDADE",
      estoqueMinimo: 0,
    };

    let produtoId: string;
    try {
      // Mesma regra da importação por CSV: o SKU é a identidade da peça — se já
      // existe, atualiza em vez de duplicar.
      const existente = await buscarProdutoPorSku(sku);
      if (existente) {
        await atualizarProduto(existente.id, produto);
        produtoId = existente.id;
        atualizados += 1;
      } else {
        produtoId = (await criarProduto(produto)).id;
        criados += 1;
      }
    } catch {
      avisos.push(`${referencia}: não foi possível salvar (SKU "${sku}" em conflito).`);
      continue;
    }

    const quantidade = linha.quantidade ?? 0;
    if (quantidade <= 0) {
      avisos.push(`${referencia}: sem quantidade — cadastrada, mas sem entrada de estoque.`);
      continue;
    }
    if (precoCustoRef <= 0) {
      avisos.push(`${referencia}: sem preço de custo — cadastrada, mas sem entrada de estoque.`);
      continue;
    }

    itensEntrada.push({ produtoId, quantidade, custoUnitario: precoCustoRef });
  }

  if (criados === 0 && atualizados === 0) {
    throw new ErroLote(
      `Nenhuma peça pôde ser lançada. ${avisos[0] ?? "Confira os dados da prévia."}`
    );
  }

  let entradaEstoqueId: string | null = null;
  let unidadesEmEstoque = 0;

  if (itensEntrada.length > 0) {
    // As peças já foram gravadas acima; se a entrada falhar, o cadastro continua
    // de pé e o aviso diz exatamente isso, para o estoque ser lançado à mão.
    try {
      const entrada = await registrarEntradaEstoque({
        fornecedorId: dados.fornecedorId,
        dataEntrada: dados.dataEntrada,
        itens: itensEntrada,
        valorFrete: dados.valorFrete,
        observacoes: dados.observacoes,
        usuarioId: dados.usuarioId,
      });
      entradaEstoqueId = entrada.id;
      unidadesEmEstoque = itensEntrada.reduce((soma, item) => soma + item.quantidade, 0);
    } catch (erro) {
      avisos.push(
        `As peças foram cadastradas, mas a entrada de estoque falhou (${
          erro instanceof Error ? erro.message : "erro inesperado"
        }). Lance o estoque manualmente em Estoque › Entrada.`
      );
    }
  }

  return { criados, atualizados, entradaEstoqueId, unidadesEmEstoque, avisos };
}
