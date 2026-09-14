"use client";

import { useActionState } from "react";
import type { EstadoProduto } from "@/app/produtos/actions";
import {
  nicho,
  rotuloDecimal,
  rotuloMedida,
  type CampoDecimalNicho,
  type CampoTextoNicho,
} from "@/config/nicho";

type FornecedorOpcao = { id: string; nome: string };

type ValoresIniciais = {
  nome: string;
  marca: string;
  categoria: string;
  medida: number | null;
  sku: string;
  codigoBarras: string | null;
  precoCustoRef: number;
  precoVenda: number;
  fornecedorId: string | null;
  atributoA: string | null;
  atributoB: string | null;
  banho: string | null;
  espessuraMilesimos: number | null;
  comprimentoCm: number | null;
  aro: string | null;
  materialBase: string | null;
  pedra: string | null;
  garantiaMeses: number | null;
  tipoVenda: string;
  estoqueMinimo: number;
  fotoPath: string | null;
};

const ESTADO_INICIAL: EstadoProduto = {};

/**
 * Campo de texto do nicho: vira `select` quando o atributo tem lista fechada de
 * opções e `input` quando é texto livre. Não renderiza nada se estiver desligado.
 */
function CampoTexto({
  campo,
  valorInicial,
}: {
  campo: CampoTextoNicho;
  valorInicial: string | null | undefined;
}) {
  const config = nicho.atributos[campo];
  if (!config.ativo) return null;

  return (
    <div>
      <label className="label" htmlFor={campo}>
        {config.rotulo}
      </label>
      {config.opcoes.length > 0 ? (
        <select id={campo} name={campo} defaultValue={valorInicial ?? ""} className="input">
          <option value="">Não informado</option>
          {config.opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input id={campo} name={campo} defaultValue={valorInicial ?? undefined} className="input" />
      )}
      {config.ajuda && (
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {config.ajuda}
        </p>
      )}
    </div>
  );
}

/** Campo numérico com casa decimal (comprimento em cm, espessura do banho). */
function CampoDecimal({
  campo,
  valorInicial,
}: {
  campo: CampoDecimalNicho;
  valorInicial: number | null | undefined;
}) {
  const config = nicho.atributos[campo];
  if (!config.ativo) return null;

  return (
    <div>
      <label className="label" htmlFor={campo}>
        {rotuloDecimal(campo)}
      </label>
      <input
        id={campo}
        name={campo}
        type="number"
        step={config.passo}
        min={0}
        defaultValue={valorInicial ?? undefined}
        className="input"
      />
      {config.ajuda && (
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {config.ajuda}
        </p>
      )}
    </div>
  );
}

export function ProdutoForm({
  action,
  fornecedores,
  valoresIniciais,
  tipoVendaBloqueado = false,
  podeVerCustos = true,
}: {
  action: (estado: EstadoProduto, formData: FormData) => Promise<EstadoProduto>;
  fornecedores: FornecedorOpcao[];
  valoresIniciais?: ValoresIniciais;
  tipoVendaBloqueado?: boolean;
  podeVerCustos?: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nome">
            Nome *
          </label>
          <input
            id="nome"
            name="nome"
            required
            defaultValue={valoresIniciais?.nome}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="marca">
            {nicho.termos.marca}
          </label>
          <input
            id="marca"
            name="marca"
            defaultValue={valoresIniciais?.marca}
            className="input"
            placeholder={nicho.termos.marcaPadrao}
          />
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Em branco vira “{nicho.termos.marcaPadrao}”.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="categoria">
            {nicho.termos.categoria} *
          </label>
          <input
            id="categoria"
            name="categoria"
            required
            defaultValue={valoresIniciais?.categoria}
            className="input"
            placeholder={nicho.categoriasProdutoIniciais.slice(0, 2).join(", ")}
          />
        </div>
        {nicho.atributos.medida.ativo && (
          <div>
            <label className="label" htmlFor="medida">
              {rotuloMedida()}
            </label>
            <input
              id="medida"
              name="medida"
              type="number"
              min={0}
              defaultValue={valoresIniciais?.medida ?? undefined}
              className="input"
            />
            {nicho.atributos.medida.ajuda && (
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                {nicho.atributos.medida.ajuda}
              </p>
            )}
          </div>
        )}
        <CampoTexto campo="atributoA" valorInicial={valoresIniciais?.atributoA} />
        <CampoTexto campo="atributoB" valorInicial={valoresIniciais?.atributoB} />
      </div>

      {/* Atributos da peça — banho, espessura, tamanho, aro, material e pedra. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CampoTexto campo="banho" valorInicial={valoresIniciais?.banho} />
        <CampoDecimal campo="espessura" valorInicial={valoresIniciais?.espessuraMilesimos} />
        <CampoTexto campo="materialBase" valorInicial={valoresIniciais?.materialBase} />
        <CampoDecimal campo="comprimento" valorInicial={valoresIniciais?.comprimentoCm} />
        <CampoTexto campo="aro" valorInicial={valoresIniciais?.aro} />
        <CampoTexto campo="pedra" valorInicial={valoresIniciais?.pedra} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sku">
            SKU *
          </label>
          <input
            id="sku"
            name="sku"
            required
            defaultValue={valoresIniciais?.sku}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="codigoBarras">
            Código de barras
          </label>
          <input
            id="codigoBarras"
            name="codigoBarras"
            defaultValue={valoresIniciais?.codigoBarras ?? undefined}
            className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {podeVerCustos ? (
          <div>
            <label className="label" htmlFor="precoCustoRef">
              Preço de custo (R$)
            </label>
            <input
              id="precoCustoRef"
              name="precoCustoRef"
              type="number"
              step="0.01"
              min={0}
              defaultValue={valoresIniciais ? valoresIniciais.precoCustoRef / 100 : undefined}
              className="input"
            />
          </div>
        ) : (
          <input
            type="hidden"
            name="precoCustoRef"
            value={valoresIniciais?.precoCustoRef ? valoresIniciais.precoCustoRef / 100 : 0}
          />
        )}
        <div>
          <label className="label" htmlFor="precoVenda">
            Preço de venda (R$) *
          </label>
          <input
            id="precoVenda"
            name="precoVenda"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={valoresIniciais ? valoresIniciais.precoVenda / 100 : undefined}
            className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {nicho.garantia.ativo && (
          <div>
            <label className="label" htmlFor="garantiaMeses">
              {nicho.garantia.rotulo} (meses)
            </label>
            <input
              id="garantiaMeses"
              name="garantiaMeses"
              type="number"
              min={0}
              defaultValue={valoresIniciais?.garantiaMeses ?? undefined}
              className="input"
              placeholder={String(nicho.garantia.padraoMeses)}
            />
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Em branco usa o padrão da loja ({nicho.garantia.padraoMeses} meses).
            </p>
          </div>
        )}

        {nicho.estoque.vendaFracionada.ativo ? (
          <div>
            <label className="label" htmlFor="tipoVenda">
              Tipo de venda
            </label>
            {tipoVendaBloqueado ? (
              <>
                <select
                  id="tipoVenda"
                  disabled
                  defaultValue={valoresIniciais?.tipoVenda ?? "UNIDADE"}
                  className="input"
                >
                  <option value="UNIDADE">Unidade fechada</option>
                  <option value="FRACIONADO">{nicho.estoque.vendaFracionada.rotulo}</option>
                </select>
                <input type="hidden" name="tipoVenda" value={valoresIniciais?.tipoVenda ?? "UNIDADE"} />
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  Não pode ser alterado — este produto já tem lotes de estoque registrados.
                </p>
              </>
            ) : (
              <select
                id="tipoVenda"
                name="tipoVenda"
                defaultValue={valoresIniciais?.tipoVenda ?? "UNIDADE"}
                className="input"
              >
                <option value="UNIDADE">Unidade fechada</option>
                <option value="FRACIONADO">{nicho.estoque.vendaFracionada.rotulo}</option>
              </select>
            )}
          </div>
        ) : (
          // Venda fracionada desligada no nicho: o campo some da tela e toda peça
          // é vendida por unidade.
          <input type="hidden" name="tipoVenda" value="UNIDADE" />
        )}

        <div>
          <label className="label" htmlFor="estoqueMinimo">
            Estoque mínimo
          </label>
          <input
            id="estoqueMinimo"
            name="estoqueMinimo"
            type="number"
            min={0}
            defaultValue={valoresIniciais?.estoqueMinimo ?? 0}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="fornecedorId">
          {nicho.termos.fornecedor.singular}
        </label>
        <select
          id="fornecedorId"
          name="fornecedorId"
          defaultValue={valoresIniciais?.fornecedorId ?? ""}
          className="input"
        >
          <option value="">Sem {nicho.termos.fornecedor.singular.toLowerCase()} vinculado</option>
          {fornecedores.map((fornecedor) => (
            <option key={fornecedor.id} value={fornecedor.id}>
              {fornecedor.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="foto">
          Foto da peça
        </label>
        {valoresIniciais?.fotoPath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={valoresIniciais.fotoPath}
            alt="Foto atual da peça"
            className="mb-2 h-24 w-24 rounded-lg object-cover"
          />
        )}
        <input id="foto" name="foto" type="file" accept="image/*" className="input" />
      </div>

      {estado.erro && (
        <p className="badge badge-danger w-fit" role="alert">
          {estado.erro}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={pendente}>
        {pendente ? <span className="spinner" /> : `Salvar ${nicho.termos.produto.singular.toLowerCase()}`}
      </button>
    </form>
  );
}
