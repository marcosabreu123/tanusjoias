"use client";

import { useActionState, useState } from "react";
import { salvarTaxaCartaoAction, type EstadoTaxa } from "./actions";
import { MAX_PARCELAS, aceitaParcelamento } from "@/lib/taxasCartao";
import type { FormaPagamento } from "@/lib/types";

const ESTADO_INICIAL: EstadoTaxa = {};

export function TaxaCartaoForm() {
  const [estado, formAction, pendente] = useActionState(salvarTaxaCartaoAction, ESTADO_INICIAL);
  const [forma, setForma] = useState<FormaPagamento>("CARTAO_CREDITO");

  const parcelavel = aceitaParcelamento(forma);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="formaPagamento">
            Forma
          </label>
          <select
            id="formaPagamento"
            name="formaPagamento"
            className="input"
            value={forma}
            onChange={(evento) => setForma(evento.target.value as FormaPagamento)}
          >
            <option value="CARTAO_CREDITO">Cartão de crédito</option>
            <option value="CARTAO_DEBITO">Cartão de débito</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="parcelas">
            Parcelas
          </label>
          {parcelavel ? (
            <select id="parcelas" name="parcelas" className="input" defaultValue={1}>
              {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((numero) => (
                <option key={numero} value={numero}>
                  {numero === 1 ? "À vista" : `${numero}x`}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select id="parcelas" className="input" disabled defaultValue={1}>
                <option value={1}>À vista</option>
              </select>
              <input type="hidden" name="parcelas" value={1} />
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Débito não é parcelado.
              </p>
            </>
          )}
        </div>

        <div>
          <label className="label" htmlFor="percentual">
            Taxa (%)
          </label>
          <input
            id="percentual"
            name="percentual"
            className="input"
            inputMode="decimal"
            placeholder="4,99"
            required
          />
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            O que a maquininha retém. Está no extrato da adquirente.
          </p>
        </div>
      </div>

      {estado.erro && (
        <p className="badge badge-danger w-fit" role="alert">
          {estado.erro}
        </p>
      )}
      {estado.sucesso && <p className="badge badge-success w-fit">{estado.sucesso}</p>}

      <button type="submit" className="btn btn-primary btn-block" disabled={pendente}>
        {pendente ? <span className="spinner" /> : "Salvar taxa"}
      </button>
    </form>
  );
}
