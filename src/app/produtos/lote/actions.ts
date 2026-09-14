"use server";

import { revalidatePath } from "next/cache";
import { requireEscrita, ErroPermissao } from "@/lib/permissoes-servidor";
import { registrarAuditoria } from "@/lib/auditoria";
import { ErroAssistente } from "@/lib/assistente/config";
import { interpretarLista, ErroLote, type ArquivoLote, type LinhaLote } from "@/lib/lote/interpretar";
import { aplicarLote, type ResultadoLote } from "@/lib/lote/aplicar";
import { reaisParaCentavos } from "@/lib/money";

const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024; // 10 MB
const TIPOS_ACEITOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export type EstadoInterpretacao = {
  erro?: string;
  linhas?: LinhaLote[];
};

/**
 * Passo 1 — a IA lê a lista e devolve a prévia. NÃO grava nada: o resultado vai
 * para a tela, onde o usuário corrige antes de confirmar.
 */
export async function interpretarListaAction(
  _estadoAnterior: EstadoInterpretacao,
  formData: FormData
): Promise<EstadoInterpretacao> {
  try {
    await requireEscrita("produtos");
  } catch (erro) {
    if (erro instanceof ErroPermissao) return { erro: erro.message };
    throw erro;
  }

  const texto = String(formData.get("texto") ?? "");
  const anexo = formData.get("arquivo");

  let arquivo: ArquivoLote | undefined;
  if (anexo instanceof File && anexo.size > 0) {
    if (!TIPOS_ACEITOS.includes(anexo.type)) {
      return { erro: "Anexe um PDF ou uma foto (PNG, JPG ou WEBP) da lista." };
    }
    if (anexo.size > TAMANHO_MAXIMO_ARQUIVO) {
      return { erro: "Arquivo muito grande — o limite é 10 MB." };
    }
    arquivo = {
      nome: anexo.name,
      tipo: anexo.type,
      base64: Buffer.from(await anexo.arrayBuffer()).toString("base64"),
    };
  }

  try {
    const linhas = await interpretarLista({ texto, arquivo });
    return { linhas };
  } catch (erro) {
    if (erro instanceof ErroLote || erro instanceof ErroAssistente) {
      return { erro: erro.message };
    }
    return { erro: "Não foi possível interpretar a lista. Tente de novo em instantes." };
  }
}

export type EstadoAplicacao = {
  erro?: string;
  resultado?: ResultadoLote;
};

/**
 * Passo 2 — grava. Recebe as linhas JÁ REVISADAS na tela, não as que a IA
 * devolveu: quem decide o que entra é o usuário, sempre.
 */
export async function aplicarLoteAction(dados: {
  linhas: LinhaLote[];
  fornecedorId: string | null;
  freteReais: string;
  dataEntrada: string;
  observacoes: string;
}): Promise<EstadoAplicacao> {
  let usuario;
  try {
    usuario = await requireEscrita("produtos");
  } catch (erro) {
    if (erro instanceof ErroPermissao) return { erro: erro.message };
    throw erro;
  }

  const data = dados.dataEntrada ? new Date(`${dados.dataEntrada}T12:00:00`) : new Date();
  if (Number.isNaN(data.getTime())) return { erro: "Data de entrada inválida." };

  try {
    const resultado = await aplicarLote({
      linhas: dados.linhas,
      fornecedorId: dados.fornecedorId || null,
      valorFrete: reaisParaCentavos(dados.freteReais || "0"),
      dataEntrada: data,
      observacoes: dados.observacoes.trim() || "Lançamento em lote pela IA",
      usuarioId: usuario.id,
    });

    await registrarAuditoria({
      usuarioId: usuario.id,
      acao: "produto.lote",
      entidade: "Produto",
      entidadeId: resultado.entradaEstoqueId,
      detalhes: `${resultado.criados} criada(s), ${resultado.atualizados} atualizada(s), ${resultado.unidadesEmEstoque} unidade(s) em estoque`,
    });

    revalidatePath("/produtos");
    revalidatePath("/estoque");
    return { resultado };
  } catch (erro) {
    if (erro instanceof ErroLote) return { erro: erro.message };
    return { erro: "Não foi possível concluir o lançamento." };
  }
}
