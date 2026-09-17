"use client";

import { useState, useTransition } from "react";
import { redefinirSenhaAction } from "./actions";
import { TAMANHO_MINIMO_SENHA } from "@/lib/senha";

/**
 * Redefinição de senha de outro usuário, pelo dono. A senha nova é digitada
 * aqui e entregue à pessoa por fora — o sistema não guarda nem exibe senha em
 * lugar nenhum depois de gravada.
 */
export function RedefinirSenhaButton({ usuarioId, nome }: { usuarioId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  function confirmar() {
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      setMensagem({ tipo: "erro", texto: `Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres.` });
      return;
    }
    iniciarTransicao(async () => {
      const resultado = await redefinirSenhaAction(usuarioId, senha);
      if (!resultado.ok) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      setMensagem({ tipo: "ok", texto: `Senha de ${nome} redefinida.` });
      setSenha("");
      setAberto(false);
    });
  }

  if (!aberto) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" className="btn btn-outline" onClick={() => setAberto(true)}>
          Redefinir senha
        </button>
        {mensagem?.tipo === "ok" && <span className="badge badge-success">{mensagem.texto}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        type="password"
        className="input"
        style={{ maxWidth: 220 }}
        placeholder="Nova senha"
        value={senha}
        autoComplete="new-password"
        onChange={(evento) => {
          setSenha(evento.target.value);
          setMensagem(null);
        }}
      />
      {mensagem?.tipo === "erro" && <span className="badge badge-danger">{mensagem.texto}</span>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" disabled={pendente} onClick={confirmar}>
          {pendente ? <span className="spinner" /> : "Salvar"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setAberto(false);
            setSenha("");
            setMensagem(null);
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
