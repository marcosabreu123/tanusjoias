import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { construirSystemPrompt } from "./prompt";
import { chamarModelo, type MensagemChat } from "./openai";
import { ferramentasParaUsuario, executarFerramenta, usuarioTemPermissaoParaFerramenta, buscarFerramenta } from "./tools";
import { executores } from "./executores";
import { pareceConfirmacao, pareceNegacao } from "./confirmacao";
import { registrarInteracaoAssistente } from "./auditoria-assistente";
import { buscarInteracaoPorRequestId } from "./idempotencia";
import { listarHistoricoConversa, buscarConversaDoUsuario } from "./conversas";
import { obterConfigAdmin } from "./configAdmin";
import type { ProcessarMensagemParams, ProcessarMensagemResultado, ToolResultado } from "./types";

const MAX_CHAMADAS_FERRAMENTA_POR_TURNO = 4;
const PREVIEW_VALIDADE_MS = 15 * 60 * 1000;

async function limiteDiarioExcedido(usuarioId: string, limite: number): Promise<boolean> {
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const quantidade = await prisma.assistenteInteracao.count({
    where: { usuarioId, createdAt: { gte: inicioDoDia } },
  });
  return quantidade >= limite;
}

// Sanitiza o log da interação para JSON puro (Date -> string ISO etc.) antes
// de gravar no campo Json do Prisma, que não aceita valores não-serializáveis.
function paraJsonSeguro(valor: unknown): unknown {
  return JSON.parse(JSON.stringify(valor));
}

async function limparPreviewPendente(conversaId: string) {
  await prisma.assistenteConversa.update({
    where: { id: conversaId },
    data: { previewFerramenta: null, previewArgs: Prisma.DbNull, previewCriadoEm: null, updatedAt: new Date() },
  });
}

export async function processarMensagem(params: ProcessarMensagemParams): Promise<ProcessarMensagemResultado> {
  const { usuario, conversaId, texto, origemEntrada, transcricao, requestId } = params;

  const configAdmin = await obterConfigAdmin();
  if (!configAdmin.habilitado) {
    return { resposta: "O assistente de IA está desativado no momento.", estado: "erro" };
  }

  const textoLimpo = texto.trim();
  if (!textoLimpo) {
    return { resposta: "Não recebi nenhuma mensagem. Pode tentar de novo?", estado: "erro" };
  }

  // Idempotência — clique duplicado, atualização de página ou retry de rede
  // não devem reprocessar a mesma mensagem.
  const existente = await buscarInteracaoPorRequestId(requestId);
  if (existente) {
    const resultado = existente.resultadoJson as { resposta?: string } | null;
    return { resposta: resultado?.resposta ?? "Esta ação já havia sido concluída.", estado: "concluido" };
  }

  const conversa = await buscarConversaDoUsuario(conversaId, usuario.id);
  if (!conversa) {
    return { resposta: "Conversa não encontrada.", estado: "erro" };
  }

  if (await limiteDiarioExcedido(usuario.id, configAdmin.limiteDiarioPorUsuario)) {
    return { resposta: "Limite diário de mensagens do assistente atingido. Tente novamente amanhã.", estado: "erro" };
  }

  // ---------- Curto-circuito determinístico de confirmação (Fase 2) ----------
  // Nunca deixa o modelo decidir se uma ação de escrita deve ser executada —
  // se há uma prévia pendente nesta conversa, a decisão de confirmar/cancelar
  // é tomada aqui, por uma heurística fixa, antes de qualquer chamada à IA.
  if (conversa.previewFerramenta && conversa.previewCriadoEm) {
    const expirada = Date.now() - conversa.previewCriadoEm.getTime() > PREVIEW_VALIDADE_MS;

    if (expirada) {
      await limparPreviewPendente(conversaId);
    } else if (pareceNegacao(textoLimpo)) {
      await limparPreviewPendente(conversaId);
      await registrarInteracaoAssistente({
        usuarioId: usuario.id,
        conversaId,
        requestId,
        mensagemOriginal: textoLimpo,
        tipoEntrada: origemEntrada,
        transcricao: transcricao ?? null,
        resultadoJson: paraJsonSeguro({ resposta: "Operação cancelada." }) as Prisma.InputJsonValue,
      });
      return { resposta: "Operação cancelada.", estado: "concluido", aguardandoConfirmacao: false };
    } else if (pareceConfirmacao(textoLimpo)) {
      const nomeFerramenta = conversa.previewFerramenta;

      if (!usuarioTemPermissaoParaFerramenta(usuario, nomeFerramenta)) {
        await limparPreviewPendente(conversaId);
        return { resposta: "Você não tem mais permissão para confirmar essa ação.", estado: "erro" };
      }

      const executor = executores[nomeFerramenta];
      const argsPendentes = (conversa.previewArgs as Record<string, unknown>) ?? {};

      let resultado: ToolResultado;
      if (!executor) {
        resultado = { success: false, error_code: "PREVIEW_EXPIRADA", message: "Não encontrei mais essa prévia — peça de novo, por favor." };
      } else {
        try {
          resultado = await executor(argsPendentes, usuario, conversaId);
        } catch (erro) {
          resultado = {
            success: false,
            error_code: "ERRO_INTERNO",
            message: erro instanceof Error ? erro.message : "Erro inesperado ao executar a ação.",
          };
        }
      }

      await limparPreviewPendente(conversaId);
      await registrarInteracaoAssistente({
        usuarioId: usuario.id,
        conversaId,
        requestId,
        mensagemOriginal: textoLimpo,
        tipoEntrada: origemEntrada,
        transcricao: transcricao ?? null,
        ferramenta: nomeFerramenta,
        argumentosJson: paraJsonSeguro(argsPendentes) as Prisma.InputJsonValue,
        resultadoJson: paraJsonSeguro({ resposta: resultado.message, resultado }) as Prisma.InputJsonValue,
        erro: resultado.success ? null : resultado.message,
      });

      return { resposta: resultado.message, estado: resultado.success ? "concluido" : "erro", aguardandoConfirmacao: false };
    }
    // ambíguo: segue pro fluxo normal do modelo — o system prompt já avisa
    // que há uma prévia pendente, então o modelo pode tanto pedir uma
    // confirmação mais clara quanto atender a um pedido novo do usuário.
  }

  const ferramentas = ferramentasParaUsuario(usuario);
  const historico = await listarHistoricoConversa(conversaId, 10);

  const mensagens: MensagemChat[] = [
    { role: "system", content: construirSystemPrompt(usuario, { previewPendente: conversa.previewFerramenta }) },
  ];
  for (const linha of historico) {
    mensagens.push({ role: "user", content: linha.mensagemOriginal });
    const resultadoAnterior = linha.resultadoJson as { resposta?: string } | null;
    if (resultadoAnterior?.resposta) {
      mensagens.push({ role: "assistant", content: resultadoAnterior.resposta });
    }
  }
  mensagens.push({ role: "user", content: textoLimpo });

  const ferramentasChamadas: Array<{ nome: string; args: Record<string, unknown>; resultado: ToolResultado }> = [];
  let respostaFinal = "";
  let erroFinal: string | null = null;

  try {
    for (let iteracao = 0; iteracao < MAX_CHAMADAS_FERRAMENTA_POR_TURNO; iteracao++) {
      const resposta = await chamarModelo(mensagens, ferramentas);

      if (resposta.toolCalls.length === 0) {
        respostaFinal = resposta.texto ?? "";
        break;
      }

      mensagens.push({
        role: "assistant",
        content: resposta.texto,
        tool_calls: resposta.toolCalls,
      });

      for (const chamada of resposta.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(chamada.function.arguments || "{}");
        } catch {
          args = {};
        }

        const resultado = await executarFerramenta(chamada.function.name, args, usuario);
        ferramentasChamadas.push({ nome: chamada.function.name, args, resultado });

        mensagens.push({
          role: "tool",
          tool_call_id: chamada.id,
          content: JSON.stringify(resultado),
        });
      }

      if (iteracao === MAX_CHAMADAS_FERRAMENTA_POR_TURNO - 1) {
        respostaFinal = "Não consegui concluir essa consulta — tente reformular de um jeito mais direto.";
      }
    }
  } catch (erro) {
    erroFinal = erro instanceof Error ? erro.message : "Erro inesperado ao consultar o assistente.";
  }

  const ultimaChamada = ferramentasChamadas[ferramentasChamadas.length - 1];
  let aguardandoConfirmacao = false;
  let nivelConfirmacao: 1 | 2 | 3 | undefined;

  // Se a última ferramenta chamada foi uma prévia (Nível 2+) bem-sucedida,
  // guarda os argumentos resolvidos na conversa — só assim o turno seguinte
  // (confirmar/cancelar) sabe exatamente o que executar, sem depender do
  // modelo repetir os mesmos argumentos corretamente.
  if (
    !erroFinal &&
    ultimaChamada &&
    ultimaChamada.nome.endsWith("_preview") &&
    ultimaChamada.resultado.success &&
    typeof ultimaChamada.resultado.data === "object" &&
    ultimaChamada.resultado.data !== null &&
    "resolvido" in (ultimaChamada.resultado.data as Record<string, unknown>)
  ) {
    const resolvido = (ultimaChamada.resultado.data as Record<string, unknown>).resolvido;
    await prisma.assistenteConversa.update({
      where: { id: conversaId },
      data: {
        previewFerramenta: ultimaChamada.nome,
        previewArgs: paraJsonSeguro(resolvido) as Prisma.InputJsonValue,
        previewCriadoEm: new Date(),
      },
    });
    aguardandoConfirmacao = true;
    nivelConfirmacao = buscarFerramenta(ultimaChamada.nome)?.nivel;
  }

  await registrarInteracaoAssistente({
    usuarioId: usuario.id,
    conversaId,
    requestId,
    mensagemOriginal: textoLimpo,
    tipoEntrada: origemEntrada,
    transcricao: transcricao ?? null,
    ferramenta: ultimaChamada?.nome ?? null,
    argumentosJson: ultimaChamada ? (paraJsonSeguro(ultimaChamada.args) as Prisma.InputJsonValue) : undefined,
    resultadoJson: erroFinal
      ? undefined
      : (paraJsonSeguro({ resposta: respostaFinal, ferramentasChamadas }) as Prisma.InputJsonValue),
    erro: erroFinal,
  });

  if (!aguardandoConfirmacao) {
    await prisma.assistenteConversa.update({ where: { id: conversaId }, data: { updatedAt: new Date() } });
  }

  if (erroFinal) {
    return {
      resposta: "Não foi possível processar sua mensagem no momento. Tente novamente em instantes.",
      estado: "erro",
    };
  }

  return {
    resposta: respostaFinal || "Não entendi — pode reformular?",
    estado: "concluido",
    aguardandoConfirmacao,
    nivelConfirmacao,
  };
}
