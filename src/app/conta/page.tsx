import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TrocarSenhaForm } from "./TrocarSenhaForm";

const LABEL_PAPEL: Record<string, string> = {
  OWNER: "Dono",
  GERENTE: "Gerente",
  SELLER: "Vendedor",
  ESTOQUE: "Estoque",
  CONSULTA: "Consulta",
};

export default async function ContaPage() {
  const usuario = await requireUser();

  return (
    <AppShell usuario={usuario}>
      <PageHeader title="Minha conta" />

      <div className="card mb-6 grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="label-caps mb-1">Nome</p>
          <p>{usuario.nome}</p>
        </div>
        <div>
          <p className="label-caps mb-1">E-mail</p>
          <p>{usuario.email}</p>
        </div>
        <div>
          <p className="label-caps mb-1">Perfil</p>
          <p>{LABEL_PAPEL[usuario.papel] ?? usuario.papel}</p>
        </div>
      </div>

      <h2 className="label-caps mb-3">Trocar senha</h2>
      <TrocarSenhaForm />
    </AppShell>
  );
}
