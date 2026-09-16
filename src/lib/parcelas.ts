/**
 * Divisão de um valor em parcelas.
 *
 * Fica em módulo próprio, sem Prisma, porque a tela do pedido (componente
 * client) precisa mostrar a prévia do carnê com exatamente a mesma conta que o
 * servidor vai aplicar — e importar `lib/compras.ts` no client arrastaria o
 * banco inteiro para o bundle.
 */

export const MAX_PARCELAS_COMPRA = 24;

export class ErroParcelamento extends Error {}

/**
 * Divide um total (centavos) em parcelas inteiras, sem perder nem inventar
 * centavo: a sobra da divisão vai toda na PRIMEIRA parcela. É como o fornecedor
 * costuma cobrar — diferença na entrada — e deixa as seguintes todas iguais,
 * que é como o carnê chega na mão do dono.
 */
export function dividirEmParcelas(total: number, parcelas: number): number[] {
  if (!Number.isInteger(parcelas) || parcelas < 1) {
    throw new ErroParcelamento("Número de parcelas inválido.");
  }
  const base = Math.floor(total / parcelas);
  const sobra = total - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => (i === 0 ? base + sobra : base));
}
