import { prisma } from "./db";
import type { FormaPagamento, Prisma } from "@prisma/client";

/**
 * Taxa da maquininha.
 *
 * O cliente sempre paga o total da venda — a taxa não é acréscimo cobrado dele,
 * é desconto no que a loja recebe. Por isso ela não entra em `Venda.total` nem
 * no saldo devedor: entra só no lucro.
 *
 * Percentuais ficam em pontos-base (4,99% = 499), inteiros, pelo mesmo motivo de
 * o dinheiro ficar em centavos: somar e arredondar float vira diferença de
 * centavo no fechamento do mês.
 */

export class ErroTaxaCartao extends Error {}

/** Formas de pagamento que passam por maquininha. */
export const FORMAS_COM_TAXA: FormaPagamento[] = ["CARTAO_CREDITO", "CARTAO_DEBITO"];

/** Teto de parcelas oferecido na tela de venda. */
export const MAX_PARCELAS = 12;

export function aceitaParcelamento(forma: FormaPagamento): boolean {
  return forma === "CARTAO_CREDITO";
}

export function temTaxa(forma: FormaPagamento): boolean {
  return FORMAS_COM_TAXA.includes(forma);
}

/** "4,99" (como o usuário digita) → 499 pontos-base. */
export function percentualParaBps(valor: string | number): number {
  const numero = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  if (!Number.isFinite(numero)) return 0;
  return Math.round(numero * 100);
}

/** 499 → "4,99". */
export function bpsParaPercentual(bps: number): string {
  return (bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valor retido pela maquininha, em centavos. */
export function valorDaTaxa(totalCentavos: number, percentualBps: number): number {
  if (totalCentavos <= 0 || percentualBps <= 0) return 0;
  return Math.round((totalCentavos * percentualBps) / 10000);
}

export type TaxaAplicada = {
  percentualBps: number;
  valor: number;
};

/**
 * Taxa vigente para a combinação forma/parcelas. Combinação sem linha cadastrada
 * devolve 0% — de propósito: o sistema nunca inventa uma taxa, porque um número
 * chutado aqui distorceria o lucro sem ninguém perceber. A tela de taxas avisa
 * quando não há nada configurado.
 */
export async function taxaVigente(
  forma: FormaPagamento,
  parcelas: number,
  cliente: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  if (!temTaxa(forma)) return 0;

  const linha = await cliente.taxaCartao.findUnique({
    where: { formaPagamento_parcelas: { formaPagamento: forma, parcelas } },
  });
  return linha && linha.ativo ? linha.percentualBps : 0;
}

/** Calcula a taxa de uma venda que está sendo registrada. */
export async function calcularTaxaDaVenda(
  params: { formaPagamento: FormaPagamento; parcelas: number; total: number },
  cliente: Prisma.TransactionClient | typeof prisma = prisma
): Promise<TaxaAplicada> {
  const percentualBps = await taxaVigente(params.formaPagamento, params.parcelas, cliente);
  return { percentualBps, valor: valorDaTaxa(params.total, percentualBps) };
}

/** Normaliza o número de parcelas informado pela tela. */
export function normalizarParcelas(forma: FormaPagamento, parcelas: number | undefined): number {
  if (!aceitaParcelamento(forma)) return 1;
  const numero = Math.round(parcelas ?? 1);
  if (!Number.isFinite(numero) || numero < 1) return 1;
  return Math.min(numero, MAX_PARCELAS);
}

// ---------------------------------------------------------------------------
// Cadastro das taxas
// ---------------------------------------------------------------------------

export async function listarTaxasCartao() {
  return prisma.taxaCartao.findMany({
    orderBy: [{ formaPagamento: "asc" }, { parcelas: "asc" }],
  });
}

export async function salvarTaxaCartao(dados: {
  formaPagamento: FormaPagamento;
  parcelas: number;
  percentualBps: number;
  ativo: boolean;
}) {
  if (!temTaxa(dados.formaPagamento)) {
    throw new ErroTaxaCartao("Só cartão de crédito e de débito têm taxa de maquininha.");
  }
  if (dados.parcelas < 1 || dados.parcelas > MAX_PARCELAS) {
    throw new ErroTaxaCartao(`Parcelas deve ficar entre 1 e ${MAX_PARCELAS}.`);
  }
  if (!aceitaParcelamento(dados.formaPagamento) && dados.parcelas !== 1) {
    throw new ErroTaxaCartao("Cartão de débito não é parcelado.");
  }
  // 0% é válido (taxa zero negociada); acima de 100% é sempre erro de digitação.
  if (dados.percentualBps < 0 || dados.percentualBps > 10000) {
    throw new ErroTaxaCartao("Percentual inválido — informe algo entre 0 e 100.");
  }

  return prisma.taxaCartao.upsert({
    where: {
      formaPagamento_parcelas: {
        formaPagamento: dados.formaPagamento,
        parcelas: dados.parcelas,
      },
    },
    create: dados,
    update: { percentualBps: dados.percentualBps, ativo: dados.ativo },
  });
}

export async function removerTaxaCartao(id: string) {
  return prisma.taxaCartao.delete({ where: { id } });
}

/** Usado pela tela de venda para mostrar quanto sobra em cada parcelamento. */
export async function taxasAtivasPorForma(): Promise<Record<string, number>> {
  const linhas = await prisma.taxaCartao.findMany({ where: { ativo: true } });
  const mapa: Record<string, number> = {};
  for (const linha of linhas) {
    mapa[`${linha.formaPagamento}:${linha.parcelas}`] = linha.percentualBps;
  }
  return mapa;
}
