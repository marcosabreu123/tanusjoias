"use client";

import { useActionState } from "react";
import { trocarSenhaAction, type EstadoSenha } from "./actions";
import { TAMANHO_MINIMO_SENHA } from "@/lib/senha";

const ESTADO_INICIAL: EstadoSenha = {};

export function TrocarSenhaForm() {
  const [estado, formAction, pendente] = useActionState(trocarSenhaAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-6">
      <div>
        <label className="label" htmlFor="senhaAtual">
          Senha atual *
        </label>
        <input
          id="senhaAtual"
          name="senhaAtual"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="novaSenha">
            Nova senha *
          </label>
          <input
            id="novaSenha"
            name="novaSenha"
            type="password"
            required
            minLength={TAMANHO_MINIMO_SENHA}
            autoComplete="new-password"
            className="input"
          />
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Mínimo de {TAMANHO_MINIMO_SENHA} caracteres.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="confirmacao">
            Repita a nova senha *
          </label>
          <input
            id="confirmacao"
            name="confirmacao"
            type="password"
            required
            minLength={TAMANHO_MINIMO_SENHA}
            autoComplete="new-password"
            className="input"
          />
        </div>
      </div>

      {estado.erro && (
        <p className="badge badge-danger w-fit" role="alert">
          {estado.erro}
        </p>
      )}
      {estado.sucesso && <p className="badge badge-success w-fit">{estado.sucesso}</p>}

      <button type="submit" className="btn btn-primary btn-block" disabled={pendente}>
        {pendente ? <span className="spinner" /> : "Trocar senha"}
      </button>
    </form>
  );
}
