"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  ErroTaxaCartao,
  percentualParaBps,
  removerTaxaCartao,
  salvarTaxaCartao,
} from "@/lib/taxasCartao";
import type { FormaPagamento } from "@prisma/client";

export type EstadoTaxa = { erro?: string; sucesso?: string };

export async function salvarTaxaCartaoAction(
  _estadoAnterior: EstadoTaxa,
  formData: FormData
): Promise<EstadoTaxa> {
  const usuario = await requireOwner();

  const formaPagamento = String(formData.get("formaPagamento") ?? "") as FormaPagamento;
  const parcelas = Number(formData.get("parcelas") ?? 1);
  const percentualBps = percentualParaBps(String(formData.get("percentual") ?? "0"));

  try {
    await salvarTaxaCartao({ formaPagamento, parcelas, percentualBps, ativo: true });
    await registrarAuditoria({
      usuarioId: usuario.id,
      acao: "taxaCartao.salvar",
      entidade: "TaxaCartao",
      detalhes: `${formaPagamento} ${parcelas}x`,
      valorNovo: percentualBps,
    });
  } catch (erro) {
    if (erro instanceof ErroTaxaCartao) return { erro: erro.message };
    return { erro: "Não foi possível salvar a taxa." };
  }

  revalidatePath("/financeiro/taxas-cartao");
  revalidatePath("/vendas/nova");
  revalidatePath("/relatorios/lucro");
  return { sucesso: "Taxa salva." };
}

export async function removerTaxaCartaoAction(id: string) {
  const usuario = await requireOwner();
  await removerTaxaCartao(id);
  await registrarAuditoria({
    usuarioId: usuario.id,
    acao: "taxaCartao.remover",
    entidade: "TaxaCartao",
    entidadeId: id,
  });
  revalidatePath("/financeiro/taxas-cartao");
  revalidatePath("/vendas/nova");
  revalidatePath("/relatorios/lucro");
}
