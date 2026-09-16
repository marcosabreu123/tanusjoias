"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FornecedorAutocomplete } from "@/components/FornecedorAutocomplete";
import { ProdutoAutocomplete, type ProdutoBusca } from "@/components/ProdutoAutocomplete";
import { centavosParaReais, reaisParaCentavos } from "@/lib/money";
import { criarPedidoAction, atualizarPedidoAction } from "../actions";
import { dividirEmParcelas, MAX_PARCELAS_COMPRA } from "@/lib/parcelas";
import type { DadosPedido } from "@/lib/compras";
import { nicho, rotuloDemonstracao } from "@/config/nicho";

/** "2026-03-14" → "14/03/2026", sem passar por Date (evita susto de fuso). */
function formatarDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

type ItemLocal = {
  produtoId: string;
  nome: string;
  tipoVenda: "UNIDADE" | "FRACIONADO";
  quantidade: number;
  quantidadeDemonstracao: number;
  custoUnitarioStr: string;
};

export type ItemPedidoInicial = {
  produtoId: string;
  nome: string;
  tipoVenda: "UNIDADE" | "FRACIONADO";
  quantidade: number;
  quantidadeDemonstracao: number;
  custoUnitario: number; // centavos
};

export type ValoresIniciaisPedido = {
  fornecedor: { id: string; nome: string };
  itens: ItemPedidoInicial[];
  valorFrete: number; // centavos
  observacoes: string | null;
  parcelas?: number;
  /** "YYYY-MM-DD" */
  primeiroVencimento?: string;
  formaPagamentoCompra?: string;
};

export function PedidoForm({
  modo,
  pedidoId,
  valoresIniciais,
}: {
  modo: "criar" | "editar";
  pedidoId?: string;
  valoresIniciais?: ValoresIniciaisPedido;
}) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [fornecedor, setFornecedor] = useState<{ id: string; nome: string } | null>(
    valoresIniciais?.fornecedor ?? null
  );
  const [itens, setItens] = useState<ItemLocal[]>(
    valoresIniciais?.itens.map((item) => ({
      produtoId: item.produtoId,
      nome: item.nome,
      tipoVenda: item.tipoVenda,
      quantidade: item.quantidade,
      quantidadeDemonstracao: item.quantidadeDemonstracao,
      custoUnitarioStr: (item.custoUnitario / 100).toFixed(2).replace(".", ","),
    })) ?? []
  );
  const [valorFreteStr, setValorFreteStr] = useState(
    valoresIniciais && valoresIniciais.valorFrete > 0
      ? (valoresIniciais.valorFrete / 100).toFixed(2).replace(".", ",")
      : ""
  );
  const [observacoes, setObservacoes] = useState(valoresIniciais?.observacoes ?? "");
  const [parcelas, setParcelas] = useState(valoresIniciais?.parcelas ?? 1);
  const [primeiroVencimento, setPrimeiroVencimento] = useState(
    valoresIniciais?.primeiroVencimento ?? ""
  );
  const [formaPagamentoCompra, setFormaPagamentoCompra] = useState(
    valoresIniciais?.formaPagamentoCompra ?? ""
  );

  const total = useMemo(
    () =>
      itens.reduce(
        (soma, item) =>
          soma + reaisParaCentavos(item.custoUnitarioStr || "0") * (item.quantidade + item.quantidadeDemonstracao),
        0
      ) + reaisParaCentavos(valorFreteStr || "0"),
    [itens, valorFreteStr]
  );

  // Mesma divisão que o servidor fará ao enviar o pedido — a prévia não pode
  // mostrar um número e o carnê sair outro.
  const parcelasPrevia = useMemo(
    () => (total > 0 ? dividirEmParcelas(total, parcelas) : []),
    [total, parcelas]
  );

  function adicionarProduto(produto: ProdutoBusca) {
    setMensagem(null);
    setItens((atual) => {
      if (atual.some((item) => item.produtoId === produto.id)) return atual;
      return [
        ...atual,
        {
          produtoId: produto.id,
          nome: produto.nome,
          tipoVenda: produto.tipoVenda,
          quantidade: 1,
          quantidadeDemonstracao: 0,
          custoUnitarioStr: "",
        },
      ];
    });
  }

  function removerItem(produtoId: string) {
    setItens((atual) => atual.filter((item) => item.produtoId !== produtoId));
  }

  function atualizarQuantidade(produtoId: string, campo: "quantidade" | "quantidadeDemonstracao", valor: number) {
    setItens((atual) =>
      atual.map((item) => (item.produtoId === produtoId ? { ...item, [campo]: Math.max(0, valor) } : item))
    );
  }

  function atualizarCusto(produtoId: string, valor: string) {
    setItens((atual) => atual.map((item) => (item.produtoId === produtoId ? { ...item, custoUnitarioStr: valor } : item)));
  }

  function montarDados() {
    return {
      fornecedorId: fornecedor!.id,
      valorFrete: reaisParaCentavos(valorFreteStr || "0"),
      observacoes: observacoes || null,
      parcelas,
      // Meio-dia evita que o fuso jogue o vencimento para o dia anterior.
      primeiroVencimento: primeiroVencimento ? new Date(`${primeiroVencimento}T12:00:00`) : null,
      formaPagamentoCompra: (formaPagamentoCompra || null) as DadosPedido["formaPagamentoCompra"],
      itens: itens.map((item) => ({
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        quantidadeDemonstracao: item.quantidadeDemonstracao,
        custoUnitario: reaisParaCentavos(item.custoUnitarioStr || "0"),
      })),
    };
  }

  function salvar(enviarAoSalvar: boolean) {
    if (!fornecedor) {
      setMensagem("Selecione o fornecedor.");
      return;
    }
    if (itens.length === 0) {
      setMensagem("Adicione ao menos um item ao pedido.");
      return;
    }
    if (itens.some((item) => item.quantidade <= 0)) {
      setMensagem("Informe uma quantidade válida para cada item.");
      return;
    }
    if (itens.some((item) => reaisParaCentavos(item.custoUnitarioStr || "0") <= 0)) {
      setMensagem("Informe o custo unitário de cada item.");
      return;
    }

    setMensagem(null);
    iniciarTransicao(async () => {
      const dados = montarDados();

      if (modo === "editar" && pedidoId) {
        const resultado = await atualizarPedidoAction(pedidoId, dados);
        if (!resultado.ok) {
          setMensagem(resultado.erro);
          return;
        }
        router.push(`/compras/${pedidoId}`);
        return;
      }

      const resultado = await criarPedidoAction(dados, enviarAoSalvar);
      if (!resultado.ok) {
        setMensagem(resultado.erro);
        return;
      }
      router.push(`/compras/${resultado.pedidoId}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-3 p-5">
        <p className="label">Fornecedor *</p>
        {fornecedor ? (
          <div className="flex items-center justify-between">
            <span className="font-medium">{fornecedor.nome}</span>
            <button type="button" className="btn btn-outline" onClick={() => setFornecedor(null)}>
              Trocar
            </button>
          </div>
        ) : (
          <FornecedorAutocomplete onSelecionar={(f) => setFornecedor({ id: f.id, nome: f.nome })} />
        )}
      </div>

      <div className="card flex flex-col gap-4 p-5">
        <p className="label">Itens do pedido *</p>
        <ProdutoAutocomplete onSelecionar={adicionarProduto} placeholder="Buscar produto para adicionar ao pedido..." />

        {itens.length === 0 ? (
          <p className="state-empty">Nenhum item adicionado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {itens.map((item) => (
              <li
                key={item.produtoId}
                className="flex flex-wrap items-center gap-3 border-b pb-3"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="flex-1 font-medium">{item.nome}</span>
                <label className="flex items-center gap-1 text-sm" style={{ color: "var(--muted)" }}>
                  {item.tipoVenda === "FRACIONADO" ? `Qtd (${nicho.atributos.medida.unidade})` : "Qtd"}
                  <input
                    type="number"
                    min={1}
                    className="input"
                    style={{ width: 70 }}
                    value={item.quantidade}
                    onChange={(evento) => atualizarQuantidade(item.produtoId, "quantidade", Number(evento.target.value) || 0)}
                  />
                </label>
                <label className="flex items-center gap-1 text-sm" style={{ color: "var(--muted)" }}>
                  {item.tipoVenda === "FRACIONADO" ? `${rotuloDemonstracao} (${nicho.atributos.medida.unidade})` : rotuloDemonstracao}
                  <input
                    type="number"
                    min={0}
                    className="input"
                    style={{ width: 70 }}
                    value={item.quantidadeDemonstracao}
                    onChange={(evento) =>
                      atualizarQuantidade(item.produtoId, "quantidadeDemonstracao", Number(evento.target.value) || 0)
                    }
                  />
                </label>
                <label className="flex items-center gap-1 text-sm" style={{ color: "var(--muted)" }}>
                  {item.tipoVenda === "FRACIONADO" ? "Custo/ml (R$)" : "Custo unit. (R$)"}
                  <input
                    className="input"
                    style={{ width: 100 }}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={item.custoUnitarioStr}
                    onChange={(evento) => atualizarCusto(item.produtoId, evento.target.value)}
                  />
                </label>
                <span className="w-24 text-right font-semibold">
                  {centavosParaReais(
                    reaisParaCentavos(item.custoUnitarioStr || "0") * (item.quantidade + item.quantidadeDemonstracao)
                  )}
                </span>
                <button type="button" className="btn btn-outline" onClick={() => removerItem(item.produtoId)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card flex flex-col gap-4 p-5">
        <div>
          <label className="label" htmlFor="valorFrete">
            Valor do frete (R$)
          </label>
          <input
            id="valorFrete"
            className="input"
            inputMode="decimal"
            placeholder="0,00"
            value={valorFreteStr}
            onChange={(evento) => setValorFreteStr(evento.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="parcelas">
              Pagamento
            </label>
            <select
              id="parcelas"
              className="input"
              value={parcelas}
              onChange={(evento) => setParcelas(Number(evento.target.value))}
            >
              {Array.from({ length: MAX_PARCELAS_COMPRA }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `${n}x`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="primeiroVencimento">
              {parcelas > 1 ? "Vencimento da 1ª parcela" : "Vencimento"}
            </label>
            <input
              id="primeiroVencimento"
              type="date"
              className="input"
              value={primeiroVencimento}
              onChange={(evento) => setPrimeiroVencimento(evento.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="formaPagamentoCompra">
              Forma de pagamento
            </label>
            <select
              id="formaPagamentoCompra"
              className="input"
              value={formaPagamentoCompra}
              onChange={(evento) => setFormaPagamentoCompra(evento.target.value)}
            >
              <option value="">Não informada</option>
              <option value="BOLETO">Boleto</option>
              <option value="PIX">Pix</option>
              <option value="TRANSFERENCIA">Transferência</option>
              <option value="CARTAO_CREDITO">Cartão de crédito</option>
              <option value="CARTAO_DEBITO">Cartão de débito</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>
        </div>

        {/* Prévia do carnê: o dono confere antes que vire conta a pagar. */}
        {total > 0 && (
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            {parcelas > 1 ? (
              <>
                {parcelasPrevia[0] !== parcelasPrevia[parcelasPrevia.length - 1] ? (
                  <>
                    1ª de {centavosParaReais(parcelasPrevia[0])} e {parcelas - 1}x de{" "}
                    {centavosParaReais(parcelasPrevia[1])}
                  </>
                ) : (
                  <>
                    {parcelas}x de {centavosParaReais(parcelasPrevia[0])}
                  </>
                )}
                {primeiroVencimento && `, a partir de ${formatarDataBR(primeiroVencimento)}`}
              </>
            ) : (
              <>Parcela única de {centavosParaReais(total)}</>
            )}
            . Entra em <strong>Despesas</strong> como conta a pagar ao enviar o pedido.
          </div>
        )}

        <div>
          <label className="label" htmlFor="observacoes">
            Observações
          </label>
          <textarea
            id="observacoes"
            className="input"
            rows={3}
            value={observacoes}
            onChange={(evento) => setObservacoes(evento.target.value)}
          />
        </div>
        <div className="resumo-total">
          <span className="label-caps">Total do pedido</span>
          <span className="resumo-total-valor">{centavosParaReais(total)}</span>
        </div>
      </div>

      {mensagem && (
        <p className="state-error" role="alert">
          {mensagem}
        </p>
      )}

      <div className="flex gap-2">
        {modo === "editar" ? (
          <button type="button" className="btn btn-primary" disabled={pendente} onClick={() => salvar(false)}>
            {pendente ? <span className="spinner" /> : "Salvar alterações"}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-outline" disabled={pendente} onClick={() => salvar(false)}>
              {pendente ? <span className="spinner" /> : "Salvar rascunho"}
            </button>
            <button type="button" className="btn btn-primary" disabled={pendente} onClick={() => salvar(true)}>
              {pendente ? <span className="spinner" /> : "Salvar e enviar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
