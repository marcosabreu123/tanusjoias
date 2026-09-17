import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Papel } from "@prisma/client";
import { TAMANHO_MINIMO_SENHA } from "./senha";

export async function listarUsuarios() {
  return prisma.usuario.findMany({ orderBy: { nome: "asc" } });
}

export async function criarUsuario(dados: { nome: string; email: string; senha: string; papel: Papel }) {
  const senhaHash = await bcrypt.hash(dados.senha, 10);
  return prisma.usuario.create({
    data: { nome: dados.nome, email: dados.email, senhaHash, papel: dados.papel },
  });
}

export async function alternarAtivoUsuario(id: string, ativo: boolean) {
  return prisma.usuario.update({ where: { id }, data: { ativo } });
}

export class ErroUsuario extends Error {}

/** Reexportado de `senha.ts` para o servidor ter um import só. */
export { TAMANHO_MINIMO_SENHA };

/**
 * Troca a senha do próprio usuário. Exige a senha atual: sem isso, um
 * computador deixado aberto no balcão vira troca de senha do dono.
 */
export async function trocarPropriaSenha(params: {
  usuarioId: string;
  senhaAtual: string;
  novaSenha: string;
}) {
  if (params.novaSenha.length < TAMANHO_MINIMO_SENHA) {
    throw new ErroUsuario(`A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: params.usuarioId } });
  if (!usuario) throw new ErroUsuario("Usuário não encontrado.");

  const confere = await bcrypt.compare(params.senhaAtual, usuario.senhaHash);
  if (!confere) throw new ErroUsuario("Senha atual incorreta.");

  const senhaHash = await bcrypt.hash(params.novaSenha, 10);
  return prisma.usuario.update({ where: { id: params.usuarioId }, data: { senhaHash } });
}

/**
 * Redefinição feita pelo dono para outro usuário — o caso "a vendedora esqueceu
 * a senha". Não pede a senha antiga, justamente porque ninguém a tem; por isso
 * fica restrita ao dono e é registrada na auditoria por quem chama.
 */
export async function redefinirSenhaDeUsuario(usuarioId: string, novaSenha: string) {
  if (novaSenha.length < TAMANHO_MINIMO_SENHA) {
    throw new ErroUsuario(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }
  const senhaHash = await bcrypt.hash(novaSenha, 10);
  return prisma.usuario.update({ where: { id: usuarioId }, data: { senhaHash } });
}
