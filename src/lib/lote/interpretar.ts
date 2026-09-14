import OpenAI from "openai";
import { assistenteConfig, ErroAssistente } from "@/lib/assistente/config";
import { descartarModelo, ehErroDeModelo, escolherModelo } from "@/lib/assistente/modelos";
import { nicho, resolverOpcao, type CampoTextoNicho } from "@/config/nicho";

/**
 * Lançamento em lote: transforma a lista do fornecedor (texto colado, PDF ou
 * foto) em linhas estruturadas de peça.
 *
 * A IA só INTERPRETA — nada é gravado aqui. O resultado vai para uma prévia
 * editável e só um clique explícito do usuário aplica, seguindo a mesma regra do
 * assistente de voz: o modelo nunca recebe uma ferramenta de escrita.
 */

export class ErroLote extends Error {}

/** Uma peça extraída da lista, ainda em unidades de tela (reais, não centavos). */
export type LinhaLote = {
  nome: string;
  categoria: string | null;
  banho: string | null;
  espessura: number | null;
  comprimentoCm: number | null;
  aro: string | null;
  materialBase: string | null;
  pedra: string | null;
  publico: string | null;
  sku: string | null;
  quantidade: number | null;
  /** Reais. */
  precoCusto: number | null;
  /** Reais. */
  precoVenda: number | null;
  observacao: string | null;
};

export type ArquivoLote = {
  nome: string;
  tipo: string;
  /** Conteúdo já em base64, sem o prefixo `data:`. */
  base64: string;
};

const MAX_LINHAS = 200;

const CAMPOS: Array<keyof LinhaLote> = [
  "nome",
  "categoria",
  "banho",
  "espessura",
  "comprimentoCm",
  "aro",
  "materialBase",
  "pedra",
  "publico",
  "sku",
  "quantidade",
  "precoCusto",
  "precoVenda",
  "observacao",
];

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["linhas"],
  properties: {
    linhas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: CAMPOS,
        properties: {
          nome: { type: "string", description: "Nome da peça, como aparece na lista." },
          categoria: { type: ["string", "null"], description: "Tipo da peça: anel, brinco, colar..." },
          banho: { type: ["string", "null"], description: "Acabamento/banho da peça." },
          espessura: { type: ["number", "null"], description: "Espessura do banho em milésimos." },
          comprimentoCm: { type: ["number", "null"], description: "Comprimento da peça em cm." },
          aro: { type: ["string", "null"], description: "Aro do anel ou tamanho em letra." },
          materialBase: { type: ["string", "null"], description: "Metal de base sob o banho." },
          pedra: { type: ["string", "null"], description: "Pedra ou aplicação." },
          publico: { type: ["string", "null"], description: "Público da peça." },
          sku: { type: ["string", "null"], description: "Código/referência da peça, se a lista trouxer." },
          quantidade: { type: ["integer", "null"], description: "Quantidade recebida." },
          precoCusto: { type: ["number", "null"], description: "Preço de custo em reais." },
          precoVenda: { type: ["number", "null"], description: "Preço de venda em reais." },
          observacao: { type: ["string", "null"], description: "Qualquer detalhe que não coube nos outros campos." },
        },
      },
    },
  },
} as const;

/** Lista as opções válidas de um campo para o modelo escolher entre elas. */
function opcoesDe(campo: CampoTextoNicho): string {
  const config = nicho.atributos[campo];
  if (!config.ativo) return "campo desligado, devolva sempre null";
  if (config.opcoes.length === 0) return "texto livre";
  return config.opcoes.map((o) => `${o.valor} (${o.rotulo})`).join(", ");
}

function montarInstrucoes(): string {
  return [
    `Você extrai peças de ${nicho.negocio.segmento} de uma lista de fornecedor para cadastro em sistema.`,
    "",
    "Regras:",
    "- Uma linha de saída por peça distinta da lista. Não invente peças que não estão lá.",
    "- NUNCA invente preço, quantidade ou medida. O que a lista não disser, devolva null.",
    "- Preços em reais, com ponto decimal (39.90). Ignore símbolo de moeda.",
    '- "un", "pç", "peças" indicam quantidade. Se a lista não disser, devolva null.',
    "- Comprimento em cm (45cm → 45). Espessura do banho em milésimos.",
    "- Escolha os campos abaixo APENAS entre os valores listados; se não der para decidir com segurança, devolva null.",
    "",
    `categoria: ${nicho.categoriasProdutoIniciais.join(", ")} (ou outra, se a lista indicar claramente)`,
    `banho: ${opcoesDe("banho")}`,
    `materialBase: ${opcoesDe("materialBase")}`,
    `pedra: ${opcoesDe("pedra")}`,
    `publico: ${opcoesDe("atributoB")}`,
    `aro: ${opcoesDe("aro")}`,
  ].join("\n");
}

function conteudoDoArquivo(
  arquivo: ArquivoLote
): OpenAI.Chat.Completions.ChatCompletionContentPart {
  if (arquivo.tipo.startsWith("image/")) {
    return {
      type: "image_url",
      image_url: { url: `data:${arquivo.tipo};base64,${arquivo.base64}` },
    };
  }
  // PDF vai como arquivo mesmo — o modelo lê o texto e o layout sem precisar de
  // biblioteca de extração no servidor.
  return {
    type: "file",
    file: { filename: arquivo.nome, file_data: `data:${arquivo.tipo};base64,${arquivo.base64}` },
  };
}

/** Normaliza uma linha crua do modelo: casa opções, corta lixo, arruma sinais. */
function normalizarLinha(bruta: Record<string, unknown>): LinhaLote | null {
  const texto = (chave: string): string | null => {
    const valor = bruta[chave];
    if (typeof valor !== "string") return null;
    const limpo = valor.trim();
    return limpo.length > 0 ? limpo : null;
  };
  const numero = (chave: string): number | null => {
    const valor = bruta[chave];
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
    return valor;
  };
  const opcao = (campo: CampoTextoNicho, chave: string): string | null =>
    nicho.atributos[campo].ativo ? resolverOpcao(campo, texto(chave)) : null;

  const nome = texto("nome");
  if (!nome) return null;

  return {
    nome,
    categoria: texto("categoria"),
    banho: opcao("banho", "banho"),
    espessura: nicho.atributos.espessura.ativo ? numero("espessura") : null,
    comprimentoCm: nicho.atributos.comprimento.ativo ? numero("comprimentoCm") : null,
    aro: opcao("aro", "aro"),
    materialBase: opcao("materialBase", "materialBase"),
    pedra: opcao("pedra", "pedra"),
    publico: opcao("atributoB", "publico"),
    sku: texto("sku"),
    quantidade: (() => {
      const q = numero("quantidade");
      return q === null ? null : Math.round(q);
    })(),
    precoCusto: numero("precoCusto"),
    precoVenda: numero("precoVenda"),
    observacao: texto("observacao"),
  };
}

/**
 * Lê a lista e devolve as linhas interpretadas. Aceita texto, imagem ou PDF —
 * pelo menos um dos dois precisa vir preenchido.
 */
export async function interpretarLista(entrada: {
  texto?: string;
  arquivo?: ArquivoLote;
}): Promise<LinhaLote[]> {
  const textoLimpo = (entrada.texto ?? "").trim();
  if (!textoLimpo && !entrada.arquivo) {
    throw new ErroLote("Cole a lista ou anexe um arquivo para interpretar.");
  }

  if (!assistenteConfig.apiKey) {
    throw new ErroAssistente(
      "CONFIG_AUSENTE",
      "O lançamento em lote usa a IA e precisa da OPENAI_API_KEY configurada."
    );
  }

  const openai = new OpenAI({ apiKey: assistenteConfig.apiKey });

  const partes: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  if (entrada.arquivo) partes.push(conteudoDoArquivo(entrada.arquivo));
  partes.push({
    type: "text",
    text: textoLimpo
      ? `Extraia as peças desta lista:\n\n${textoLimpo}`
      : "Extraia as peças da lista anexada.",
  });

  // Lista em PDF/foto precisa de um modelo que aceite arquivo e imagem na
  // entrada; texto colado se resolve com qualquer um. `escolherModelo` cuida
  // disso e dispensa fixar o nome do modelo no ambiente.
  const capacidade = entrada.arquivo ? "documento" : "conversa";

  const chamar = async () =>
    openai.chat.completions.create({
      model: await escolherModelo(openai, capacidade),
      messages: [
        { role: "system", content: montarInstrucoes() },
        { role: "user", content: partes },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "lista_de_pecas", strict: true, schema: ESQUEMA },
      },
    });

  let resposta;
  try {
    resposta = await chamar();
  } catch (erro) {
    if (!ehErroDeModelo(erro)) throw erro;
    descartarModelo(await escolherModelo(openai, capacidade));
    resposta = await chamar();
  }

  const conteudo = resposta.choices[0]?.message?.content;
  if (!conteudo) throw new ErroLote("A IA não conseguiu ler a lista. Tente colar o texto.");

  let dados: { linhas?: unknown };
  try {
    dados = JSON.parse(conteudo);
  } catch {
    throw new ErroLote("Resposta da IA em formato inesperado. Tente de novo.");
  }

  const brutas = Array.isArray(dados.linhas) ? dados.linhas : [];
  const linhas = brutas
    .filter((linha): linha is Record<string, unknown> => typeof linha === "object" && linha !== null)
    .map(normalizarLinha)
    .filter((linha): linha is LinhaLote => linha !== null)
    .slice(0, MAX_LINHAS);

  if (linhas.length === 0) {
    throw new ErroLote("Nenhuma peça reconhecida na lista. Confira o conteúdo e tente de novo.");
  }

  return linhas;
}
