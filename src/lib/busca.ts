import { Prisma } from "@prisma/client";

// Busca em linguagem natural — o dono fala "Yara da Lattafa", não "LAT-YARA-100".
//
// Duas regras que a busca antiga não tinha:
// 1. Cada palavra é procurada separadamente, e o registro só entra se TODAS
//    baterem em algum campo. Antes o texto inteiro virava uma única substring,
//    então "yara lattafa" não achava nome="Yara" + marca="Lattafa".
// 2. Palavra que não bate exatamente ainda passa por similaridade trigrama,
//    o que tolera erro de digitação ("lataffa" → "Lattafa").

// 0.35 tolera troca/transposição de poucas letras sem trazer coisa sem relação.
const LIMIAR_SIMILARIDADE = 0.35;
const MAX_TOKENS = 8;

// Conectivos que a pessoa fala mas não identificam nada ("Yara DA Lattafa").
// Se entrassem na regra do "todas as palavras precisam bater", a busca falharia
// justamente na forma mais natural de falar.
const CONECTIVOS = new Set([
  "de", "da", "do", "das", "dos", "e", "com", "a", "o", "as", "os",
  "um", "uma", "pra", "para", "por", "no", "na", "nos", "nas", "em",
]);

export function tokensDeBusca(termo: string): string[] {
  const brutos = termo
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[.,;:!?]+$/g, "").trim())
    .filter((t) => t.length > 0);

  const uteis = brutos.filter((t) => !CONECTIVOS.has(t.toLowerCase()));
  // Se sobrou nada (ex: busca literal por "de"), volta ao termo cru para não
  // devolver o catálogo inteiro.
  return (uteis.length > 0 ? uteis : brutos).slice(0, MAX_TOKENS);
}

/**
 * Condição SQL para UM token de produto: bate em nome, marca, sku, código de
 * barras, tamanho ("100ml") ou por similaridade em nome/marca.
 */
export function condicaoTokenProduto(token: string): Prisma.Sql {
  const like = `%${token}%`;
  const tamanho = token.toLowerCase().replace(/ml$/, "");
  return Prisma.sql`(
    unaccent(nome) ILIKE unaccent(${like})
    OR unaccent(marca) ILIKE unaccent(${like})
    OR sku ILIKE ${like}
    OR "codigoBarras" ILIKE ${like}
    OR (${/^\d+$/.test(tamanho)} AND "medida"::text = ${tamanho})
    OR similarity(unaccent(lower(nome)), unaccent(lower(${token}))) >= ${LIMIAR_SIMILARIDADE}
    OR similarity(unaccent(lower(marca)), unaccent(lower(${token}))) >= ${LIMIAR_SIMILARIDADE}
  )`;
}

/**
 * Nota de relevância do produto contra o termo completo. Um acerto exato no
 * nome vale mais que um acerto parcial, então "yara lattafa" coloca
 * "Yara / Lattafa" à frente de "Yara Candy / Lattafa".
 */
export function relevanciaProduto(termo: string): Prisma.Sql {
  const t = termo.toLowerCase().trim();
  return Prisma.sql`(
    (CASE WHEN unaccent(lower(nome)) = unaccent(${t}) THEN 1.0 ELSE 0.0 END)
    + (CASE WHEN unaccent(lower(nome || ' ' || marca)) = unaccent(${t}) THEN 1.0 ELSE 0.0 END)
    + similarity(unaccent(lower(nome || ' ' || marca)), unaccent(${t}))
  )`;
}

export function condicaoTokenCliente(token: string): Prisma.Sql {
  const like = `%${token}%`;
  return Prisma.sql`(
    unaccent(nome) ILIKE unaccent(${like})
    OR telefone ILIKE ${like}
    OR similarity(unaccent(lower(nome)), unaccent(lower(${token}))) >= ${LIMIAR_SIMILARIDADE}
  )`;
}

export function relevanciaCliente(termo: string): Prisma.Sql {
  const t = termo.toLowerCase().trim();
  return Prisma.sql`(
    (CASE WHEN unaccent(lower(nome)) = unaccent(${t}) THEN 1.0 ELSE 0.0 END)
    + similarity(unaccent(lower(nome)), unaccent(${t}))
  )`;
}

export function condicaoTokenFornecedor(token: string): Prisma.Sql {
  const like = `%${token}%`;
  return Prisma.sql`(
    unaccent(nome) ILIKE unaccent(${like})
    OR similarity(unaccent(lower(nome)), unaccent(lower(${token}))) >= ${LIMIAR_SIMILARIDADE}
  )`;
}

export function juntarTokens(condicoes: Prisma.Sql[]): Prisma.Sql {
  return Prisma.join(condicoes, " AND ");
}
