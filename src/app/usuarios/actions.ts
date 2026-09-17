"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  alternarAtivoUsuario,
  criarUsuario,
  redefinirSenhaDeUsuario,
  ErroUsuario,
  TAMANHO_MINIMO_SENHA,
} from "@/lib/usuarios";
import type { Papel } from "@prisma/client";

export type EstadoUsuario = { erro?: string };

export async function criarUsuarioAction(
  _estadoAnterior: EstadoUsuario,
  formData: FormData
): Promise<EstadoUsuario> {
  const usuarioLogado = await requireOwner();

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const papel = String(formData.get("papel") ?? "SELLER") as Papel;

  if (!nome || !email || senha.length < TAMANHO_MINIMO_SENHA) {
    return { erro: `Preencha nome, e-mail e uma senha com pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` };
  }

  try {
    const usuario = await criarUsuario({ nome, email, senha, papel });
    await registrarAuditoria({
      usuarioId: usuarioLogado.id,
      acao: "usuario.criar",
      entidade: "Usuario",
      entidadeId: usuario.id,
      detalhes: `${nome} · ${papel}`,
    });
  } catch {
    return { erro: "Não foi possível criar o usuário. O e-mail já pode estar em uso." };
  }

  revalidatePath("/usuarios");
  return {};
}

/**
 * Redefinição de senha de OUTRO usuário, feita pelo dono — o caso "esqueci a
 * senha". Não pede a senha antiga porque ninguém a tem; a proteção é ser
 * restrita ao dono e ficar registrada na auditoria (o que mudou, nunca a senha).
 */
export async function redefinirSenhaAction(
  usuarioId: string,
  novaSenha: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const usuarioLogado = await requireOwner();

  try {
    const alvo = await redefinirSenhaDeUsuario(usuarioId, novaSenha);
    await registrarAuditoria({
      usuarioId: usuarioLogado.id,
      acao: "usuario.redefinir-senha",
      entidade: "Usuario",
      entidadeId: usuarioId,
      detalhes: alvo.nome,
    });
  } catch (erro) {
    if (erro instanceof ErroUsuario) return { ok: false, erro: erro.message };
    return { ok: false, erro: "Não foi possível redefinir a senha." };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function alternarAtivoUsuarioAction(usuarioId: string, ativo: boolean) {
  const usuarioLogado = await requireOwner();
  await alternarAtivoUsuario(usuarioId, ativo);
  await registrarAuditoria({
    usuarioId: usuarioLogado.id,
    acao: ativo ? "usuario.ativar" : "usuario.desativar",
    entidade: "Usuario",
    entidadeId: usuarioId,
  });
  revalidatePath("/usuarios");
}
