import { IconSend } from "@/components/icons";

export function AssistenteInputTexto({
  valor,
  onChange,
  onEnviar,
  desabilitado,
}: {
  valor: string;
  onChange: (valor: string) => void;
  onEnviar: () => void;
  desabilitado: boolean;
}) {
  return (
    <div className="assistente-input-linha">
      <input
        className="input"
        placeholder="Pergunte algo ao assistente..."
        value={valor}
        disabled={desabilitado}
        onChange={(evento) => onChange(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === "Enter" && !evento.shiftKey) {
            evento.preventDefault();
            onEnviar();
          }
        }}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={desabilitado || !valor.trim()}
        onClick={onEnviar}
        aria-label="Enviar mensagem"
      >
        {desabilitado ? <span className="spinner" /> : <IconSend />}
      </button>
    </div>
  );
}
