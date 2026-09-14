"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { centavosParaReais } from "@/lib/money";
import { formatarDecimal, formatarMedida, rotuloOpcao } from "@/config/nicho";

type Produto = {
  nome: string;
  marca: string;
  medida: number | null;
  precoVenda: number;
  sku: string;
  codigoBarras: string | null;
  banho: string | null;
  comprimentoCm: number | null;
  aro: string | null;
};

export function EtiquetaProduto({ produto }: { produto: Produto }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const valorCodigo = produto.codigoBarras || produto.sku;

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, valorCodigo, {
        format: produto.codigoBarras ? "EAN13" : "CODE128",
        width: 2,
        height: 50,
        fontSize: 14,
        margin: 4,
      });
    } catch {
      JsBarcode(svgRef.current, valorCodigo, {
        format: "CODE128",
        width: 2,
        height: 50,
        fontSize: 14,
        margin: 4,
      });
    }
  }, [valorCodigo, produto.codigoBarras]);

  // A etiqueta de joia é pequena: entra só o que identifica a peça na gaveta —
  // banho, tamanho e aro. O que não estiver preenchido simplesmente não ocupa espaço.
  const detalhes = [
    rotuloOpcao("banho", produto.banho),
    formatarDecimal("comprimento", produto.comprimentoCm),
    produto.aro ? `aro ${produto.aro}` : null,
    formatarMedida(produto.medida),
  ].filter(Boolean) as string[];

  return (
    <div className="etiqueta">
      <p className="etiqueta-nome">{produto.nome}</p>
      {detalhes.length > 0 && <p className="etiqueta-detalhe">{detalhes.join(" · ")}</p>}
      <svg ref={svgRef} />
      <p className="etiqueta-preco">{centavosParaReais(produto.precoVenda)}</p>
    </div>
  );
}
