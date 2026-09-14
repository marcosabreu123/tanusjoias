import { NextResponse, type NextRequest } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { buscarProdutosParaVenda } from "@/lib/produtos";
import { nicho } from "@/config/nicho";


// Filtro rápido do balcão: banho (dourado/prateado/ródio) — ver nicho.atributos.banho.
const BANHOS_VALIDOS: string[] = nicho.atributos.banho.opcoes.map((o) => o.valor);

export async function GET(request: NextRequest) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const termo = request.nextUrl.searchParams.get("q") ?? "";
  const banhoParam = request.nextUrl.searchParams.get("banho");
  const banho = BANHOS_VALIDOS.find((valor) => valor === banhoParam);

  const produtos = await buscarProdutosParaVenda({ termo, banho });

  return NextResponse.json(produtos);
}
