import { prisma } from "./db";
import { Prisma, type TipoVenda } from "@prisma/client";
import { tokensDeBusca, condicaoTokenProduto, relevanciaProduto, juntarTokens } from "./busca";
import { nicho } from "@/config/nicho";

export type DadosProduto = {
  nome: string;
  marca: string;
  categoria: string;
  medida: number | null;
  sku: string;
  codigoBarras: string | null;
  precoCustoRef: number;
  precoVenda: number;
  fornecedorId: string | null;
  atributoA: string | null;
  atributoB: string | null;
  banho: string | null;
  espessuraMilesimos: number | null;
  comprimentoCm: number | null;
  aro: string | null;
  materialBase: string | null;
  pedra: string | null;
  /** Null = herda nicho.garantia.padraoMeses na hora da venda. */
  garantiaMeses: number | null;
  tipoVenda: TipoVenda;
  estoqueMinimo: number;
};

/**
 * A coluna `marca` é obrigatória no banco, mas em semijoia a peça costuma vir do
 * atacado sem marca. Em branco assume a marca padrão do nicho, em vez de barrar
 * o cadastro — importa principalmente no lançamento em lote.
 */
export function marcaOuPadrao(bruta: string | null | undefined): string {
  return (bruta ?? "").trim() || nicho.termos.marcaPadrao;
}

/**
 * Lê um decimal digitado por gente: aceita vírgula ("45,5"), espaço em branco e
 * unidade colada ("45cm"). Devolve null quando não sobra número válido.
 */
export function lerDecimal(bruto: string | number | null | undefined): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) && bruto >= 0 ? bruto : null;
  const texto = (bruto ?? "").trim().replace(",", ".").replace(/[^0-9.]/g, "");
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/** Mesma ideia de `lerDecimal`, para campos que só aceitam inteiro (meses, quantidade). */
export function lerInteiro(bruto: string | number | null | undefined): number | null {
  const numero = lerDecimal(bruto);
  return numero === null ? null : Math.round(numero);
}

export async function listarProdutos(busca?: string, apenasArquivados = false) {
  return prisma.produto.findMany({
    where: {
      ativo: !apenasArquivados,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { marca: { contains: busca, mode: "insensitive" } },
              { sku: { contains: busca, mode: "insensitive" } },
              { codigoBarras: { contains: busca, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { fornecedor: true },
    orderBy: { nome: "asc" },
  });
}

export async function alterarAtivoProduto(id: string, ativo: boolean) {
  return prisma.produto.update({ where: { id }, data: { ativo } });
}

export async function buscarProdutoPorId(id: string) {
  return prisma.produto.findUnique({
    where: { id },
    include: { fornecedor: true, lotes: { orderBy: { createdAt: "asc" } } },
  });
}

export async function buscarProdutoPorSku(sku: string) {
  return prisma.produto.findUnique({ where: { sku } });
}

export async function buscarPorSkuOuCodigoBarras(termo: string) {
  return prisma.produto.findFirst({
    where: {
      ativo: true,
      OR: [{ sku: termo }, { codigoBarras: termo }],
    },
  });
}

export type ProdutoParaVenda = {
  id: string;
  nome: string;
  marca: string;
  sku: string;
  codigoBarras: string | null;
  medida: number | null;
  precoVenda: number;
  tipoVenda: TipoVenda;
  atributoB: string | null;
  banho: string | null;
  comprimentoCm: number | null;
  aro: string | null;
  fotoPath: string | null;
  estoqueAtual: number;
};

// Lista para a tela de venda: sem termo, navega pelos filtros rápidos; com termo,
// busca por nome/marca/SKU/código de barras. Sempre traz o estoque atual (leitura,
// sem regra de negócio).
export async function buscarProdutosParaVenda(params: {
  termo?: string;
  banho?: string;
} = {}): Promise<ProdutoParaVenda[]> {
  const termoLimpo = params.termo?.trim();

  // Cada palavra do termo é procurada separadamente (com unaccent e tolerância
  // a erro de digitação) — ver src/lib/busca.ts. Os ids voltam já ordenados por
  // relevância, e essa ordem é preservada abaixo.
  let idsCorrespondentes: string[] | undefined;
  if (termoLimpo) {
    const condicoes = tokensDeBusca(termoLimpo).map(condicaoTokenProduto);
    const correspondentes = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "Produto"
      WHERE ativo = true AND ${juntarTokens(condicoes)}
      ORDER BY ${relevanciaProduto(termoLimpo)} DESC, nome ASC
      LIMIT 20
    `);
    idsCorrespondentes = correspondentes.map((p) => p.id);
    if (idsCorrespondentes.length === 0) return [];
  }

  const encontrados = await prisma.produto.findMany({
    where: {
      ativo: true,
      ...(params.banho ? { banho: params.banho } : {}),
      ...(idsCorrespondentes ? { id: { in: idsCorrespondentes } } : {}),
    },
    take: 20,
    orderBy: { nome: "asc" },
  });

  // findMany() com `id: { in: [...] }` ignora a ordem da lista, então a
  // relevância calculada no SQL acima seria perdida — reordena aqui.
  const produtos = idsCorrespondentes
    ? idsCorrespondentes
        .map((id) => encontrados.find((p) => p.id === id))
        .filter((p): p is (typeof encontrados)[number] => p !== undefined)
    : encontrados;

  if (produtos.length === 0) return [];

  const estoques = await prisma.lote.groupBy({
    by: ["produtoId"],
    where: { produtoId: { in: produtos.map((produto) => produto.id) }, status: "ATIVO" },
    _sum: { quantidadeAtualVenda: true },
  });
  const estoquePorProduto = new Map(estoques.map((linha) => [linha.produtoId, linha._sum.quantidadeAtualVenda ?? 0]));

  return produtos.map((produto) => ({
    id: produto.id,
    nome: produto.nome,
    marca: produto.marca,
    sku: produto.sku,
    codigoBarras: produto.codigoBarras,
    medida: produto.medida,
    precoVenda: produto.precoVenda,
    tipoVenda: produto.tipoVenda,
    atributoB: produto.atributoB,
    banho: produto.banho,
    comprimentoCm: produto.comprimentoCm,
    aro: produto.aro,
    fotoPath: produto.fotoPath,
    estoqueAtual: estoquePorProduto.get(produto.id) ?? 0,
  }));
}

export async function criarProduto(dados: DadosProduto) {
  return prisma.produto.create({ data: dados });
}

export async function atualizarProduto(id: string, dados: DadosProduto) {
  return prisma.produto.update({ where: { id }, data: dados });
}

export async function atualizarFotoProduto(id: string, fotoPath: string) {
  return prisma.produto.update({ where: { id }, data: { fotoPath } });
}

export async function estoqueTotalProduto(produtoId: string): Promise<number> {
  const resultado = await prisma.lote.aggregate({
    where: { produtoId, status: "ATIVO" },
    _sum: { quantidadeAtualVenda: true },
  });
  return resultado._sum.quantidadeAtualVenda ?? 0;
}
