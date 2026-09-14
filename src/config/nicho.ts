/**
 * PONTO ÚNICO DE PERSONALIZAÇÃO POR NICHO — Tanus Joias (semijoias).
 *
 * Este arquivo é o que muda de um cliente para outro. O resto do sistema lê
 * tudo daqui — nome do negócio, vocabulário, quais atributos a peça tem e
 * como o estoque se comporta.
 *
 * Os exemplos de outros segmentos ficam no molde de origem (erp-base), não aqui.
 */

export type OpcaoAtributo = { valor: string; rotulo: string };

export type AtributoTexto = {
  ativo: boolean;
  rotulo: string;
  /** Vazio = campo de texto livre. Preenchido = lista fechada (select). */
  opcoes: OpcaoAtributo[];
  /** Aparece como dica embaixo do campo no formulário. */
  ajuda?: string;
};

export type AtributoNumero = {
  ativo: boolean;
  rotulo: string;
  /** Sufixo exibido junto do número: "ml", "g", "cm", "V"... */
  unidade: string;
  ajuda?: string;
};

/**
 * Medida que aceita casas decimais (comprimento em cm, espessura do banho).
 * Guardada como Float no banco — não é dinheiro, então não usa o padrão de
 * centavos inteiros de `money.ts`.
 */
export type AtributoDecimal = AtributoNumero & {
  /** Incremento do campo numérico no formulário. */
  passo: number;
};

export type ConfigNicho = {
  negocio: {
    nome: string;
    /** Usado em títulos, e-mails e no prompt do assistente de IA. */
    segmento: string;
    /** Arquivo dentro de /public. */
    logoPath: string;
  };

  termos: {
    /** Como este negócio chama o que vende. */
    produto: { singular: string; plural: string };
    /** "Marca" (varejo), "Fabricante" (autopeças), "Laboratório" (farmácia)... */
    marca: string;
    /**
     * Preenchido automaticamente quando a marca não é informada. Em semijoia a
     * peça normalmente vem do atacado sem marca nenhuma, e obrigar a digitar
     * atrapalha principalmente o lançamento em lote.
     */
    marcaPadrao: string;
    /** "Categoria", "Seção", "Linha"... */
    categoria: string;
    cliente: { singular: string; plural: string };
    fornecedor: { singular: string; plural: string };
  };

  /**
   * Atributos da peça. `medida`, `atributoA` e `atributoB` são os três campos
   * genéricos do molde original; os demais são colunas próprias criadas para
   * semijoia. Desligar um atributo (`ativo: false`) some com ele dos
   * formulários, filtros e relatórios.
   */
  atributos: {
    medida: AtributoNumero;
    atributoA: AtributoTexto;
    atributoB: AtributoTexto;
    /** Acabamento: dourado 18k, prateado, ródio negro... */
    banho: AtributoTexto;
    /** Espessura do banho, em milésimos/micras. */
    espessura: AtributoDecimal;
    /** Comprimento da peça em cm (corrente, colar, pulseira). */
    comprimento: AtributoDecimal;
    /** Aro do anel ou tamanho em letra (P/M/G). Texto porque convive com os dois. */
    aro: AtributoTexto;
    /** Metal de base sob o banho: latão, aço, prata 925. */
    materialBase: AtributoTexto;
    /** Pedra ou aplicação: zircônia, pérola, resina... */
    pedra: AtributoTexto;
  };

  estoque: {
    /**
     * Segundo "bolso" de estoque, separado do que está à venda. Na perfumaria
     * é o testador; aqui é a peça que está na vitrine e não deve ser contada
     * como disponível para envio.
     */
    poolDemonstracao: { ativo: boolean; rotulo: string };
    /** Lotes com data de validade (farmácia, alimentos, cosméticos). */
    controlaValidade: boolean;
    /** Venda por fração do item (decant, granel, corte por metro). */
    vendaFracionada: { ativo: boolean; rotulo: string };
  };

  /**
   * Garantia dada ao cliente na venda. Em semijoia é a garantia do banho — a
   * reclamação mais comum do balcão. O prazo em meses é gravado na venda
   * (snapshot), então mudar a configuração depois não reescreve o passado.
   */
  garantia: {
    ativo: boolean;
    /** "Garantia do banho", "Garantia de fábrica"... */
    rotulo: string;
    /** Prazo aplicado quando a peça não define um próprio. */
    padraoMeses: number;
    /** Impresso no comprovante da venda. */
    textoComprovante: string;
  };

  /**
   * Perfis de compra do relatório de clientes: "quem já levou algo assim".
   * Os segmentos de comportamento (novo, recorrente, VIP, inativo...) são
   * universais e já vêm prontos; estes dependem do que o negócio vende.
   * Lista vazia = a seção não aparece no relatório.
   */
  perfisDeCompra: RegraPerfilCompra[];

  /** Criadas pelo seed quando o banco está vazio. */
  categoriasProdutoIniciais: string[];
  categoriasDespesaIniciais: string[];
};

/** Regra que classifica um cliente pelo tipo de item que ele já comprou. */
export type RegraPerfilCompra = {
  /** Identificador estável, usado como chave de contagem. */
  chave: string;
  /** Texto exibido no relatório. */
  rotulo: string;
  quando:
    | { tipo: "atributoA"; valor: string }
    | { tipo: "atributoB"; valor: string }
    | { tipo: "banho"; valor: string }
    | { tipo: "pedra"; valor: string }
    | { tipo: "categoriaContem"; texto: string }
    | { tipo: "medidaAte"; valor: number }
    | { tipo: "medidaAcimaDe"; valor: number }
    | { tipo: "vendaFracionada" };
};

export const nicho: ConfigNicho = {
  negocio: {
    nome: "Tanus Joias",
    segmento: "semijoias",
    // Provisório até o arquivo definitivo entrar em /public — ao subir a logo
    // da Tanus (ex.: public/logo.png), basta apontar aqui.
    logoPath: "/logo.svg",
  },

  termos: {
    produto: { singular: "Peça", plural: "Peças" },
    marca: "Marca",
    marcaPadrao: "Tanus",
    categoria: "Categoria",
    cliente: { singular: "Cliente", plural: "Clientes" },
    fornecedor: { singular: "Fornecedor", plural: "Fornecedores" },
  },

  atributos: {
    // Desligada: em semijoia a medida que importa é o comprimento em cm, que
    // precisa de casa decimal e por isso ganhou campo próprio.
    medida: { ativo: false, rotulo: "Tamanho", unidade: "un" },

    atributoA: { ativo: false, rotulo: "Atributo A", opcoes: [] },

    atributoB: {
      ativo: true,
      rotulo: "Público",
      opcoes: [
        { valor: "FEMININO", rotulo: "Feminino" },
        { valor: "MASCULINO", rotulo: "Masculino" },
        { valor: "UNISSEX", rotulo: "Unissex" },
        { valor: "INFANTIL", rotulo: "Infantil" },
      ],
    },

    banho: {
      ativo: true,
      rotulo: "Banho",
      opcoes: [
        { valor: "DOURADO", rotulo: "Dourado 18k" },
        { valor: "PRATEADO", rotulo: "Prateado" },
        { valor: "RODIO_BRANCO", rotulo: "Ródio branco" },
        { valor: "OURO_ROSE", rotulo: "Ouro rosé" },
        { valor: "RODIO_NEGRO", rotulo: "Ródio negro" },
        { valor: "SEM_BANHO", rotulo: "Sem banho" },
      ],
    },

    espessura: {
      ativo: true,
      rotulo: "Espessura do banho",
      unidade: "milésimos",
      passo: 0.5,
      ajuda: "Espessura da camada de banho, em milésimos (micras).",
    },

    comprimento: {
      ativo: true,
      rotulo: "Tamanho",
      unidade: "cm",
      passo: 0.5,
      ajuda: "Comprimento da peça — corrente, colar, pulseira, tornozeleira.",
    },

    aro: {
      ativo: true,
      rotulo: "Aro / tamanho",
      opcoes: [],
      ajuda: "Aro do anel (14, 16, 18...) ou tamanho em letra (P, M, G).",
    },

    materialBase: {
      ativo: true,
      rotulo: "Material base",
      opcoes: [
        { valor: "LATAO", rotulo: "Latão" },
        { valor: "ACO", rotulo: "Aço inox" },
        { valor: "PRATA_925", rotulo: "Prata 925" },
        { valor: "ZAMAC", rotulo: "Zamac" },
      ],
    },

    pedra: {
      ativo: true,
      rotulo: "Pedra / aplicação",
      opcoes: [
        { valor: "SEM_PEDRA", rotulo: "Sem pedra" },
        { valor: "ZIRCONIA", rotulo: "Zircônia" },
        { valor: "CRISTAL", rotulo: "Cristal" },
        { valor: "PEROLA", rotulo: "Pérola" },
        { valor: "RESINA", rotulo: "Resina" },
        { valor: "NATURAL", rotulo: "Pedra natural" },
        { valor: "MADREPEROLA", rotulo: "Madrepérola" },
      ],
    },
  },

  estoque: {
    poolDemonstracao: { ativo: true, rotulo: "Vitrine" },
    controlaValidade: false,
    vendaFracionada: { ativo: false, rotulo: "Fracionado" },
  },

  garantia: {
    ativo: true,
    rotulo: "Garantia do banho",
    padraoMeses: 6,
    textoComprovante:
      "A garantia cobre defeito de fabricação e desgaste prematuro do banho. " +
      "Não cobre mau uso, contato com perfume, cloro e produtos de limpeza, " +
      "amassados, riscos ou perda de pedras por impacto.",
  },

  perfisDeCompra: [
    { chave: "dourado", rotulo: "Compra dourado", quando: { tipo: "banho", valor: "DOURADO" } },
    { chave: "prateado", rotulo: "Compra prateado", quando: { tipo: "banho", valor: "PRATEADO" } },
    { chave: "com-pedra", rotulo: "Compra peça com zircônia", quando: { tipo: "pedra", valor: "ZIRCONIA" } },
    { chave: "masculino", rotulo: "Compra peça masculina", quando: { tipo: "atributoB", valor: "MASCULINO" } },
    { chave: "infantil", rotulo: "Compra peça infantil", quando: { tipo: "atributoB", valor: "INFANTIL" } },
    { chave: "conjunto", rotulo: "Compra conjunto", quando: { tipo: "categoriaContem", texto: "conjunto" } },
  ],

  categoriasProdutoIniciais: [
    "Anel",
    "Aliança",
    "Brinco",
    "Colar",
    "Corrente",
    "Pingente",
    "Pulseira",
    "Bracelete",
    "Tornozeleira",
    "Conjunto",
    "Piercing",
    "Berloque",
  ],
  categoriasDespesaIniciais: [
    "Aluguel",
    "Energia",
    "Água",
    "Internet e telefone",
    "Embalagens e estojos",
    "Banho e manutenção",
    "Marketing",
    "Impostos",
    "Salários",
    "Frete",
    "Outros",
  ],
};

// ---------------------------------------------------------------------------
// Atalhos de leitura — evitam espalhar `nicho.atributos.x.ativo` pelo código.
// ---------------------------------------------------------------------------

export const usaMedida = nicho.atributos.medida.ativo;
export const usaAtributoA = nicho.atributos.atributoA.ativo;
export const usaAtributoB = nicho.atributos.atributoB.ativo;
export const usaBanho = nicho.atributos.banho.ativo;
export const usaEspessura = nicho.atributos.espessura.ativo;
export const usaComprimento = nicho.atributos.comprimento.ativo;
export const usaAro = nicho.atributos.aro.ativo;
export const usaMaterialBase = nicho.atributos.materialBase.ativo;
export const usaPedra = nicho.atributos.pedra.ativo;
export const usaDemonstracao = nicho.estoque.poolDemonstracao.ativo;
export const usaValidade = nicho.estoque.controlaValidade;
export const usaVendaFracionada = nicho.estoque.vendaFracionada.ativo;
export const usaGarantia = nicho.garantia.ativo;

/** Rótulo do pool de demonstração, já resolvido. */
export const rotuloDemonstracao = nicho.estoque.poolDemonstracao.rotulo;

/** Campos de texto da peça que aceitam lista fechada de opções. */
export type CampoTextoNicho =
  | "atributoA"
  | "atributoB"
  | "banho"
  | "aro"
  | "materialBase"
  | "pedra";

/** Campos numéricos com casa decimal. */
export type CampoDecimalNicho = "espessura" | "comprimento";

/** "Tamanho (ml)" — rótulo do campo de medida já com a unidade. */
export function rotuloMedida(): string {
  const { rotulo, unidade } = nicho.atributos.medida;
  return unidade ? `${rotulo} (${unidade})` : rotulo;
}

/** "100 ml" — formata um valor de medida para exibição. */
export function formatarMedida(valor: number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const { unidade } = nicho.atributos.medida;
  return unidade ? `${valor} ${unidade}` : String(valor);
}

/** "Tamanho (cm)" — rótulo de um campo decimal já com a unidade. */
export function rotuloDecimal(campo: CampoDecimalNicho): string {
  const { rotulo, unidade } = nicho.atributos[campo];
  return unidade ? `${rotulo} (${unidade})` : rotulo;
}

/**
 * "45 cm", "3,5 milésimos" — formata um decimal para exibição, sem zero à
 * direita e com vírgula, que é como o balcão lê.
 */
export function formatarDecimal(
  campo: CampoDecimalNicho,
  valor: number | null | undefined
): string | null {
  if (valor === null || valor === undefined) return null;
  const { unidade } = nicho.atributos[campo];
  const numero = valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return unidade ? `${numero} ${unidade}` : numero;
}

/** Rótulo de exibição de uma opção de atributo (cai no próprio valor se não achar). */
export function rotuloOpcao(atributo: CampoTextoNicho, valor: string | null): string | null {
  if (!valor) return null;
  const encontrada = nicho.atributos[atributo].opcoes.find((o) => o.valor === valor);
  return encontrada ? encontrada.rotulo : valor;
}

/** Remove acento e caixa para comparar texto vindo de planilha, lista ou voz. */
function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Casa um texto solto (planilha, lista do fornecedor, ditado por voz) com uma
 * das opções configuradas. Compara sem acento e sem caixa, e aceita tanto o
 * valor ("DOURADO") quanto o rótulo ("Dourado 18k"). Atributo de texto livre
 * devolve o próprio texto; opção não reconhecida devolve null.
 */
export function resolverOpcao(
  atributo: CampoTextoNicho,
  bruto: string | null | undefined
): string | null {
  const texto = (bruto ?? "").trim();
  if (!texto) return null;

  const opcoes = nicho.atributos[atributo].opcoes;
  if (opcoes.length === 0) return texto;

  const alvo = normalizarTexto(texto);
  const encontrada = opcoes.find(
    (o) => normalizarTexto(o.valor) === alvo || normalizarTexto(o.rotulo) === alvo
  );
  return encontrada ? encontrada.valor : null;
}
