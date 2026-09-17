import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { listarUsuarios } from "@/lib/usuarios";
import { UsuarioForm } from "./UsuarioForm";
import { ToggleAtivoButton } from "./ToggleAtivoButton";
import { RedefinirSenhaButton } from "./RedefinirSenhaButton";

const LABEL_PAPEL: Record<string, string> = {
  OWNER: "Dono",
  GERENTE: "Gerente",
  SELLER: "Vendedor",
  ESTOQUE: "Estoque",
  CONSULTA: "Consulta",
};

export default async function UsuariosPage() {
  const usuarioLogado = await requireOwner();
  const usuarios = await listarUsuarios();

  return (
    <AppShell usuario={usuarioLogado}>
        <PageHeader title="Usuários" />

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Novo usuário</h2>
          <UsuarioForm />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Equipe</h2>
          <ul className="flex flex-col gap-2">
            {usuarios.map((usuario) => (
              <li key={usuario.id} className="card flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">
                    {usuario.nome} {!usuario.ativo && <span className="badge badge-danger ml-2">Inativo</span>}
                  </p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {usuario.email} · {LABEL_PAPEL[usuario.papel] ?? usuario.papel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {usuario.id === usuarioLogado.id ? (
                    // A própria senha se troca em Minha conta, onde a senha
                    // atual é exigida — aqui não, para não virar atalho de
                    // quem pegou o computador aberto.
                    <Link href="/conta" className="btn btn-outline">
                      Minha senha
                    </Link>
                  ) : (
                    <>
                      <RedefinirSenhaButton usuarioId={usuario.id} nome={usuario.nome} />
                      <ToggleAtivoButton usuarioId={usuario.id} ativo={usuario.ativo} />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
    </AppShell>
  );
}
