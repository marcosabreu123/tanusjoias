"use server";

import { requireUser } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ErroUsuario, trocarPropriaSenha } from "@/lib/usuarios";

export type EstadoSenha = { erro?: string; sucesso?: string };

export async function trocarSenhaAction(
  _estadoAnterior: EstadoSenha,
  formData: FormData
): Promise<EstadoSenha> {
  const usuario = await requireUser();

  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const novaSenha = String(formData.get("novaSenha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (novaSenha !== confirmacao) {
    return { erro: "A nova senha e a confirmação não são iguais." };
  }

  try {
    await trocarPropriaSenha({ usuarioId: usuario.id, senhaAtual, novaSenha });
  } catch (erro) {
    if (erro instanceof ErroUsuario) return { erro: erro.message };
    return { erro: "Não foi possível trocar a senha." };
  }

  // A senha nunca é registrada em lugar nenhum — só o fato de ter mudado.
  await registrarAuditoria({
    usuarioId: usuario.id,
    acao: "usuario.trocar-senha",
    entidade: "Usuario",
    entidadeId: usuario.id,
  });

  return { sucesso: "Senha alterada. Ela já vale no próximo acesso." };
}
