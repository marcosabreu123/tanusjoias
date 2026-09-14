"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  aplicarLoteAction,
  interpretarListaAction,
  type EstadoAplicacao,
  type EstadoInterpretacao,
} from "@/app/produtos/lote/actions";
import type { LinhaLote } from "@/lib/lote/interpretar";
import { nicho, rotuloDecimal, type CampoTextoNicho } from "@/config/nicho";
import { centavosParaReais, reaisParaCentavos } from "@/lib/money";

type FornecedorOpcao = { id: string; nome: string };

const ESTADO_INICIAL: EstadoInterpretacao = {};

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Campo de opção do nicho, do jeito compacto que a prévia precisa. */
function SelectOpcao({
  campo,
  valor,
  onChange,
}: {
  campo: CampoTextoNicho;
  valor: string | null;
  onChange: (valor: string | null) => void;
}) {
  const config = nicho.atributos[campo];
  if (!config.ativo) return null;

  return (
    <label className="flex flex-col gap-1">
      <span className="label-caps">{config.rotulo}</span>
      {config.opcoes.length > 0 ? (
        <select
          className="input"
          value={valor ?? ""}
          onChange={(evento) => onChange(evento.target.value || null)}
        >
          <option value="">—</option>
          {config.opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          value={valor ?? ""}
          onChange={(evento) => onChange(evento.target.value || null)}
        />
      )}
    </label>
  );
}

export function LancamentoLoteForm({ fornecedores }: { fornecedores: FornecedorOpcao[] }) {
  const [estadoIa, interpretarAction, interpretando] = useActionState(
    interpretarListaAction,
    ESTADO_INICIAL
  );

  const [linhas, setLinhas] = useState<LinhaLote[] | null>(null);
  const [multiplicador, setMultiplicador] = useState("2");
  const [fornecedorId, setFornecedorId] = useState("");
  const [freteReais, setFreteReais] = useState("");
  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [observacoes, setObservacoes] = useState("");
  const [resultado, setResultado] = useState<EstadoAplicacao | null>(null);
  const [aplicando, iniciarAplicacao] = useTransition();

  // Quando a IA devolve uma prévia nova, ela vira o estado editável da tela. O
  // preço de venda que a lista não trouxer é sugerido pelo custo vezes o
  // multiplicador — sugestão, não decisão: fica tudo editável abaixo. Só a
  // PRIMEIRA renderização de cada prévia faz isso; depois disso o que vale é o
  // que o usuário ajustou à mão.
  const [ultimaPrevia, setUltimaPrevia] = useState<LinhaLote[] | null>(null);
  if (estadoIa.linhas && estadoIa.linhas !== ultimaPrevia) {
    const fator = Number(multiplicador.replace(",", ".")) || 0;
    setUltimaPrevia(estadoIa.linhas);
    setLinhas(
      estadoIa.linhas.map((linha) => ({
        ...linha,
        quantidade: linha.quantidade ?? 1,
        precoVenda:
          linha.precoVenda ??
          (linha.precoCusto !== null && fator > 0
            ? Math.round(linha.precoCusto * fator * 100) / 100
            : null),
      }))
    );
    setResultado(null);
  }

  function atualizarLinha(indice: number, mudanca: Partial<LinhaLote>) {
    setLinhas((atual) =>
      atual ? atual.map((linha, i) => (i === indice ? { ...linha, ...mudanca } : linha)) : atual
    );
  }

  function removerLinha(indice: number) {
    setLinhas((atual) => (atual ? atual.filter((_, i) => i !== indice) : atual));
  }

  function confirmar() {
    if (!linhas || linhas.length === 0) return;
    iniciarAplicacao(async () => {
      const resposta = await aplicarLoteAction({
        linhas,
        fornecedorId: fornecedorId || null,
        freteReais,
        dataEntrada,
        observacoes,
      });
      setResultado(resposta);
      if (resposta.resultado) setLinhas(null);
    });
  }

  const totalCusto = (linhas ?? []).reduce(
    (soma, linha) => soma + reaisParaCentavos(linha.precoCusto ?? 0) * (linha.quantidade ?? 0),
    0
  );
  const totalUnidades = (linhas ?? []).reduce((soma, linha) => soma + (linha.quantidade ?? 0), 0);

  // ----- Resultado final -----
  if (resultado?.resultado) {
    const r = resultado.resultado;
    return (
      <div className="card flex flex-col gap-3 p-6">
        <h2 className="text-lg font-semibold">Lançamento concluído</h2>
        <p>
          {r.criados} peça(s) cadastrada(s), {r.atualizados} atualizada(s) e {r.unidadesEmEstoque}{" "}
          unidade(s) em estoque.
        </p>
        {r.avisos.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm" style={{ color: "var(--warning)" }}>
            {r.avisos.map((aviso, i) => (
              <li key={i}>{aviso}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/produtos" className="btn btn-primary">
            Ver {nicho.termos.produto.plural.toLowerCase()}
          </Link>
          {r.entradaEstoqueId && (
            <Link href="/estoque/entrada-estoque/historico" className="btn btn-outline">
              Ver entrada de estoque
            </Link>
          )}
          <button type="button" className="btn btn-outline" onClick={() => setResultado(null)}>
            Lançar outra lista
          </button>
        </div>
      </div>
    );
  }

  // ----- Prévia editável -----
  if (linhas) {
    return (
      <div className="flex flex-col gap-4">
        <div className="card flex flex-col gap-1 p-5">
          <p className="label-caps">Prévia — nada foi gravado ainda</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {linhas.length} peça(s), {totalUnidades} unidade(s), custo total{" "}
            {centavosParaReais(totalCusto)}. Confira e corrija antes de confirmar.
          </p>
        </div>

        {linhas.map((linha, indice) => (
          <div key={indice} className="card flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <label className="flex-1">
                <span className="label-caps">Nome</span>
                <input
                  className="input"
                  value={linha.nome}
                  onChange={(e) => atualizarLinha(indice, { nome: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="btn btn-outline mt-5"
                onClick={() => removerLinha(indice)}
                aria-label={`Remover ${linha.nome}`}
              >
                Remover
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="label-caps">{nicho.termos.categoria}</span>
                <input
                  className="input"
                  value={linha.categoria ?? ""}
                  onChange={(e) => atualizarLinha(indice, { categoria: e.target.value || null })}
                  list="categorias-lote"
                />
              </label>

              <SelectOpcao
                campo="banho"
                valor={linha.banho}
                onChange={(valor) => atualizarLinha(indice, { banho: valor })}
              />

              {nicho.atributos.comprimento.ativo && (
                <label className="flex flex-col gap-1">
                  <span className="label-caps">{rotuloDecimal("comprimento")}</span>
                  <input
                    className="input"
                    type="number"
                    step={nicho.atributos.comprimento.passo}
                    min={0}
                    value={linha.comprimentoCm ?? ""}
                    onChange={(e) =>
                      atualizarLinha(indice, {
                        comprimentoCm: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              )}

              {nicho.atributos.espessura.ativo && (
                <label className="flex flex-col gap-1">
                  <span className="label-caps">{rotuloDecimal("espessura")}</span>
                  <input
                    className="input"
                    type="number"
                    step={nicho.atributos.espessura.passo}
                    min={0}
                    value={linha.espessura ?? ""}
                    onChange={(e) =>
                      atualizarLinha(indice, {
                        espessura: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              )}

              <SelectOpcao
                campo="aro"
                valor={linha.aro}
                onChange={(valor) => atualizarLinha(indice, { aro: valor })}
              />
              <SelectOpcao
                campo="materialBase"
                valor={linha.materialBase}
                onChange={(valor) => atualizarLinha(indice, { materialBase: valor })}
              />
              <SelectOpcao
                campo="pedra"
                valor={linha.pedra}
                onChange={(valor) => atualizarLinha(indice, { pedra: valor })}
              />
              <SelectOpcao
                campo="atributoB"
                valor={linha.publico}
                onChange={(valor) => atualizarLinha(indice, { publico: valor })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="label-caps">Quantidade</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={linha.quantidade ?? ""}
                  onChange={(e) =>
                    atualizarLinha(indice, {
                      quantidade: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-caps">Custo (R$)</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min={0}
                  value={linha.precoCusto ?? ""}
                  onChange={(e) =>
                    atualizarLinha(indice, {
                      precoCusto: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-caps">Venda (R$)</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min={0}
                  value={linha.precoVenda ?? ""}
                  onChange={(e) =>
                    atualizarLinha(indice, {
                      precoVenda: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-caps">SKU</span>
                <input
                  className="input"
                  value={linha.sku ?? ""}
                  placeholder="gerado automaticamente"
                  onChange={(e) => atualizarLinha(indice, { sku: e.target.value || null })}
                />
              </label>
            </div>

            {linha.observacao && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Da lista: {linha.observacao}
              </p>
            )}
          </div>
        ))}

        <datalist id="categorias-lote">
          {nicho.categoriasProdutoIniciais.map((categoria) => (
            <option key={categoria} value={categoria} />
          ))}
        </datalist>

        <div className="card flex flex-col gap-4 p-5">
          <h2 className="label-caps">Dados da entrada de estoque</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="label">{nicho.termos.fornecedor.singular}</span>
              <select
                className="input"
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
              >
                <option value="">Sem {nicho.termos.fornecedor.singular.toLowerCase()}</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Frete total (R$)</span>
              <input
                className="input"
                type="number"
                step="0.01"
                min={0}
                value={freteReais}
                onChange={(e) => setFreteReais(e.target.value)}
                placeholder="0,00"
              />
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Rateado por unidade, entrando no custo real.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Data da entrada</span>
              <input
                className="input"
                type="date"
                value={dataEntrada}
                onChange={(e) => setDataEntrada(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label">Observações</span>
            <input
              className="input"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Nota fiscal, pedido, referência..."
            />
          </label>
        </div>

        {resultado?.erro && (
          <p className="badge badge-danger w-fit" role="alert">
            {resultado.erro}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={confirmar}
            disabled={aplicando || linhas.length === 0}
          >
            {aplicando ? <span className="spinner" /> : `Confirmar e lançar ${linhas.length} peça(s)`}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setLinhas(null)}>
            Descartar prévia
          </button>
        </div>
      </div>
    );
  }

  // ----- Entrada da lista -----
  return (
    <form action={interpretarAction} className="card flex flex-col gap-4 p-6">
      <label className="flex flex-col gap-1">
        <span className="label">Cole a lista</span>
        <textarea
          name="texto"
          rows={8}
          className="input"
          placeholder={
            "colar ponto de luz dourado 45cm — 10un — custo 12,90\n" +
            "brinco argola pequena dourado — 20un — custo 8,50\n" +
            "anel solitário zircônia aro 16 — 5un — custo 15,00"
          }
        />
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          Pode ser do jeito que o fornecedor mandou — a IA organiza e você confere depois.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="label">Ou anexe a lista (PDF ou foto)</span>
        <input
          name="arquivo"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="input"
        />
      </label>

      <label className="flex flex-col gap-1 sm:max-w-56">
        <span className="label">Multiplicador do preço de venda</span>
        <input
          className="input"
          type="number"
          step="0.1"
          min={0}
          value={multiplicador}
          onChange={(e) => setMultiplicador(e.target.value)}
        />
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          Sugere a venda a partir do custo quando a lista só traz o custo.
        </span>
      </label>

      {estadoIa.erro && (
        <p className="badge badge-danger w-fit" role="alert">
          {estadoIa.erro}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={interpretando}>
        {interpretando ? <span className="spinner" /> : "Interpretar lista"}
      </button>
    </form>
  );
}
