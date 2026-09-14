import type OpenAI from "openai";
import { assistenteConfig } from "./config";

/**
 * Escolha automática de modelo.
 *
 * O nome do modelo NÃO precisa estar no ambiente. Fixar "gpt-4o-mini" numa
 * variável da Vercel envelhece: a conta já tem modelos várias gerações à
 * frente, e ninguém lembra de voltar lá para trocar.
 *
 * Uma lista de preferência escrita à mão envelheceria do mesmo jeito. Então em
 * vez de listar nomes, o sistema pergunta à OpenAI quais modelos a conta tem,
 * lê o número da família no próprio id ("gpt-5.4-mini" → 5.4, tier mini) e fica
 * com o mais novo do tier desejado. Modelo novo entra sozinho; modelo
 * aposentado some da listagem e deixa de ser escolhido.
 *
 * A ordem de decisão é:
 *   1. variável de ambiente, se o dono quiser fixar um modelo (escape hatch);
 *   2. o mais novo da conta que sirva para a capacidade pedida;
 *   3. um padrão embutido, se a consulta à API falhar.
 */

export type CapacidadeModelo = "conversa" | "documento" | "transcricao";

/**
 * Variantes de um mesmo número de família. "full" é o id sem sufixo.
 *
 * - `nano` é fraco demais para tool calling confiável.
 * - `pro` custa caro demais para o giro do balcão.
 * - `chat` (os "-chat-latest") não são feitos para tool calling.
 * Os três ficam de fora das duas capacidades abaixo.
 */
type Tier = "full" | "mini" | "nano" | "pro" | "chat";

/** Ordem de preferência de tier por capacidade — o que vier antes ganha. */
const TIERS_ACEITOS: Record<"conversa" | "documento", Tier[]> = {
  // Completo, por decisão do dono: o assistente entende pedido falado no meio
  // do atendimento, e errar ali custa mais caro que a diferença de token.
  // Trocar para ["mini", "full"] baixa bastante a fatura, com mais erro de
  // interpretação no balcão.
  conversa: ["full", "mini"],
  // Ler PDF/foto da lista do fornecedor: uso esporádico, precisão importa mais
  // que custo, e modelo mini erra mais em documento.
  documento: ["full", "mini"],
};

/** Sufixos que nunca servem para chat com ferramentas. */
const SUFIXOS_PROIBIDOS =
  /(codex|search|audio|realtime|tts|transcribe|image|embedding|moderation|dall|instruct)/;

/** Usado quando a listagem de modelos falha — nunca deixa o sistema sem modelo. */
const PADRAO: Record<CapacidadeModelo, string> = {
  conversa: "gpt-4o-mini",
  documento: "gpt-4o",
  transcricao: "whisper-1",
};

/**
 * Transcrição não segue o padrão de versão dos modelos de chat, então aqui
 * a lista explícita continua sendo o jeito honesto de escolher.
 */
const PREFERENCIA_TRANSCRICAO = [
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "gpt-transcribe",
  "whisper-1",
];

/** Override por ambiente, opcional. Preenchido = manda em tudo. */
function fixadoNoAmbiente(capacidade: CapacidadeModelo): string | null {
  if (capacidade === "transcricao") return assistenteConfig.transcriptionModelFixo;
  return assistenteConfig.modelFixo;
}

type Candidato = { id: string; versao: number; tier: Tier };

/**
 * Lê o id do modelo. Só aceita o apelido estável ("gpt-5.4-mini"), nunca o
 * snapshot datado ("gpt-5.4-mini-2026-03-17"): o apelido acompanha as correções
 * da OpenAI sozinho.
 */
function interpretarId(id: string): Candidato | null {
  if (SUFIXOS_PROIBIDOS.test(id)) return null;

  const m = /^gpt-(\d+(?:\.\d+)?)(?:-(mini|nano|pro|chat-latest))?$/.exec(id);
  if (!m) return null;

  const versao = Number(m[1]);
  if (!Number.isFinite(versao)) return null;

  const sufixo = m[2];
  const tier: Tier =
    sufixo === undefined ? "full" : sufixo === "chat-latest" ? "chat" : (sufixo as Tier);

  return { id, versao, tier };
}

// Catálogo da conta, em memória. Uma instância do servidor consulta uma vez por
// hora; não vale um round-trip a mais em cada mensagem do assistente.
const VALIDADE_CACHE_MS = 60 * 60 * 1000;
let catalogo: { ids: string[]; buscadoEm: number } | null = null;
let buscaEmAndamento: Promise<string[]> | null = null;

async function catalogoDaConta(cliente: OpenAI): Promise<string[]> {
  if (catalogo && Date.now() - catalogo.buscadoEm < VALIDADE_CACHE_MS) return catalogo.ids;

  // Duas requisições simultâneas não devem virar duas listagens.
  if (buscaEmAndamento) return buscaEmAndamento;

  buscaEmAndamento = (async () => {
    try {
      const resposta = await cliente.models.list();
      const ids = resposta.data.map((modelo) => modelo.id);
      catalogo = { ids, buscadoEm: Date.now() };
      return ids;
    } catch {
      // Sem catálogo o sistema cai no padrão embutido, em vez de ficar sem IA.
      catalogo = { ids: [], buscadoEm: Date.now() };
      return catalogo.ids;
    } finally {
      buscaEmAndamento = null;
    }
  })();

  return buscaEmAndamento;
}

/** Modelos já descartados nesta instância por erro de "modelo não existe". */
const descartados = new Set<string>();

/** Resolve o modelo a usar para uma capacidade. */
export async function escolherModelo(
  cliente: OpenAI,
  capacidade: CapacidadeModelo
): Promise<string> {
  const fixado = fixadoNoAmbiente(capacidade);
  if (fixado) return fixado;

  const ids = await catalogoDaConta(cliente);
  const disponivel = (id: string) => ids.includes(id) && !descartados.has(id);

  if (capacidade === "transcricao") {
    return PREFERENCIA_TRANSCRICAO.find(disponivel) ?? PADRAO.transcricao;
  }

  const tiers = TIERS_ACEITOS[capacidade];
  const candidatos = ids
    .map(interpretarId)
    .filter((c): c is Candidato => c !== null)
    .filter((c) => tiers.includes(c.tier) && !descartados.has(c.id));

  // O TIER manda, e só depois a versão. É deliberado: no balcão o mini da
  // geração passada custa uma fração do completo da geração nova e dá conta do
  // recado, e essa conversa acontece o dia inteiro. Inverter isso (versão
  // primeiro) multiplicaria a fatura sem melhorar o atendimento.
  for (const tier of tiers) {
    const doTier = candidatos
      .filter((c) => c.tier === tier)
      .sort((a, b) => b.versao - a.versao);
    if (doTier.length > 0) return doTier[0].id;
  }

  return PADRAO[capacidade];
}

/** Erro da OpenAI dizendo que o modelo não existe/não está liberado. */
export function ehErroDeModelo(erro: unknown): boolean {
  if (typeof erro !== "object" || erro === null) return false;
  const e = erro as { status?: number; code?: string; message?: string };
  if (e.code === "model_not_found") return true;
  return e.status === 404 && (e.message ?? "").toLowerCase().includes("model");
}

/**
 * Marca um modelo como indisponível, para a próxima chamada cair no seguinte.
 * Chamado quando a OpenAI recusa o modelo escolhido — assim uma mudança de
 * catálogo no meio do expediente não derruba o assistente.
 */
export function descartarModelo(modelo: string): void {
  descartados.add(modelo);
  catalogo = null;
}
