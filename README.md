# Tanus Joias — sistema de gestão

Controle de estoque, vendas, clientes, compras, despesas, relatórios de lucro,
cotação de frete e assistente de IA por texto e voz, adaptado para **semijoias**.

Nasceu do molde universal `erp-base` e foi especializado para a Tanus. Banco,
repositório e deploy são **exclusivos deste cliente** — nada é compartilhado com
outro sistema.

## O que é específico da Tanus

| Recurso | Onde vive |
|---|---|
| Campos de semijoia: banho, espessura do banho, tamanho em cm, aro, material base, pedra | `prisma/schema.prisma` + `src/config/nicho.ts` |
| Garantia do banho, com snapshot na venda e consulta de balcão | `src/lib/garantia.ts`, `/garantia` |
| Lançamento em lote pela IA (texto colado, PDF ou foto da lista) | `src/lib/lote/`, `/produtos/lote` |
| Etiqueta com banho, tamanho e aro | `src/components/EtiquetaProduto.tsx` |
| Venda parcelada no cartão, com a taxa da maquininha descontada do lucro | `src/lib/taxasCartao.ts`, `/financeiro/taxas-cartao` |
| Compra parcelada do fornecedor virando contas a pagar | `src/lib/compras.ts`, `src/lib/parcelas.ts` |
| Tema escuro com acento ouro rosé | `src/app/globals.css` |

O vocabulário ("Peça" no lugar de "Produto"), as opções de cada campo, as
categorias iniciais e o prazo padrão de garantia ficam todos em
**`src/config/nicho.ts`** — mudar qualquer um deles não exige mexer em tela.

### Os campos da peça

Além de nome, categoria, SKU e preços:

- **banho** — Dourado 18k, Prateado, Ródio branco, Ouro rosé, Ródio negro.
  É também o filtro rápido da tela de venda.
- **espessura do banho** — em milésimos (aceita decimal).
- **tamanho (cm)** — comprimento de corrente, colar, pulseira (aceita decimal).
- **aro / tamanho** — aro do anel ("16") ou letra ("M").
- **material base** — latão, aço inox, prata 925, zamac.
- **pedra / aplicação** — zircônia, pérola, cristal, resina...
- **público** — feminino, masculino, unissex, infantil.
- **garantia (meses)** — em branco usa o padrão da loja.

A marca é opcional: em branco vira `termos.marcaPadrao` ("Tanus").

### Lançamento em lote pela IA

Em **Operacional › Lançamento em lote** (`/produtos/lote`): cole a lista do
fornecedor ou anexe o PDF/foto dela. A IA monta uma **prévia editável** — nada é
gravado nesse passo. Ao confirmar:

1. cada peça é cadastrada, ou atualizada se o SKU já existir;
2. tudo que tiver quantidade e custo entra no estoque numa **única entrada de
   estoque**, com o frete rateado por unidade;
3. peça sem preço de venda é recusada; sem quantidade ou sem custo é cadastrada
   mas fica sem estoque — sempre com aviso na tela.

SKU não informado é gerado por categoria (`COL-0001`, `ANE-0001`...). O
multiplicador na tela sugere o preço de venda a partir do custo quando a lista
só traz o custo.

Requer `OPENAI_API_KEY`. Para planilha, a importação por CSV continua em
`/ferramentas/importar`.

### Escolha do modelo de IA

**Não existe nome de modelo no ambiente.** `OPENAI_ASSISTANT_MODEL` fica vazia de
propósito: fixar um nome lá envelhece e obriga a mexer na Vercel toda vez que a
OpenAI lança ou aposenta um modelo.

Em vez disso, `src/lib/assistente/modelos.ts` pergunta à OpenAI quais modelos a
conta tem, lê o número da família no próprio id (`gpt-5.4-mini` → versão 5.4,
tier `mini`) e escolhe o mais novo do tier que a tarefa pede:

| Uso | Tier | Por quê |
|---|---|---|
| Assistente (texto e voz) | completo, senão `mini` | Entende pedido falado no meio do atendimento; errar ali custa mais que a diferença de token |
| Lançamento em lote com PDF/foto | completo, senão `mini` | Uso esporádico; ler documento é onde o mini erra |
| Transcrição de áudio | lista explícita | Esses ids não seguem o padrão de versão |

`nano`, `pro` e os `-chat-latest` ficam de fora: fracos demais para *tool
calling*, caros demais, ou não feitos para ferramentas.

O catálogo é consultado uma vez por hora por instância. Se a OpenAI recusar o
modelo escolhido (aposentadoria no meio do expediente), o sistema descarta aquele
id e tenta o seguinte sozinho, sem deploy.

Para fixar um modelo à força — teste, ou contornar um problema —, basta preencher
`OPENAI_ASSISTANT_MODEL` (ou `OPENAI_TRANSCRIPTION_MODEL`); preenchidas, elas
mandam em tudo.

### Compra parcelada do fornecedor

O fluxo, em **Compras**:

1. **Lançar o pedido** — itens, frete, e o pagamento: à vista ou em até 24x, com
   o vencimento da 1ª parcela e a forma de pagamento. A tela mostra a prévia do
   carnê antes de salvar.
2. **Enviar o pedido** — é aqui que as parcelas entram em **Despesas** como
   contas a pagar, uma por mês a partir do vencimento escolhido. Rascunho não
   gera conta a pagar: ele ainda pode ser editado, e cobrança órfã no sistema é
   pior que um passo a mais.
3. **Quando a mercadoria chega**, botão **Receber pedido** → vira lote no
   estoque, com o frete rateado no custo real.

Cancelar o pedido cancela as parcelas **em aberto**. Parcela já paga não é
tocada: o dinheiro saiu de verdade, e apagá-la falsearia o caixa.

> **Por que as parcelas não entram no relatório de lucro.** Elas nascem com
> `entraNoLucroLiquido = false`. O custo da mercadoria já entra no lucro como
> **CMV**, no momento em que a peça é vendida (`custoRealSnapshot` em ItemVenda).
> Se a parcela também contasse como despesa operacional, o mesmo dinheiro seria
> subtraído duas vezes e o lucro apareceria menor do que é — sem nada acusar.
>
> Elas continuam aparecendo em Despesas, nos vencimentos e no relatório de
> despesas, que é onde o dono precisa vê-las: nenhum desses filtra por
> `entraNoLucroLiquido`. Só o relatório de lucro filtra.
>
> A divisão em parcelas joga a sobra dos centavos na **primeira** parcela, para
> que as seguintes fiquem todas iguais — é como o carnê chega do fornecedor.

### Cartão parcelado e taxa da maquininha

Em **Gestão › Taxas do cartão** (`/financeiro/taxas-cartao`, só o Dono) cadastra-se
o percentual retido por forma e por número de parcelas — o que está no extrato da
adquirente.

Na venda, escolhendo crédito aparece o seletor de parcelas e, embaixo, quanto a
maquininha retém e quanto a loja recebe. Três pontos que importam:

- **A taxa não é cobrada do cliente.** Ele paga `total` do mesmo jeito; a taxa sai
  do que a loja recebe. Por isso não entra no total nem no saldo devedor.
- **Cada venda guarda a taxa do dia** (`taxaCartaoBpsSnapshot` e `taxaCartaoValor`).
  Renegociar com a adquirente vale daqui para a frente e não reescreve o lucro
  passado.
- **Combinação sem taxa cadastrada vale 0%**, de propósito — o sistema não chuta
  percentual. Enquanto não houver nada cadastrado, a tela de venda e o relatório
  de lucro avisam que a maquininha não está sendo descontada.

No relatório de lucro a taxa aparece como linha própria (entre lucro bruto e
líquido) e há uma tabela de quanto foi retido em cada parcelamento — é a resposta
para "vale a pena continuar parcelando em 6x?".

A taxa é calculada sobre o total no momento da venda e **não é recalculada em
devolução parcial**, porque a adquirente cobra sobre o que passou na máquina.

## Como rodar

Pré-requisito: Node.js 20+.

Copie `.env.example` para `.env` e preencha as credenciais do Postgres (Supabase
deste cliente). Depois:

```bash
npm install
```

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Abra http://localhost:3000 e entre com o e-mail/senha definidos no `.env`.
Troque a senha em **Usuários** no primeiro acesso.

> O `npm run build` falha se `NEXT_PUBLIC_SUPABASE_URL` e
> `SUPABASE_SERVICE_ROLE_KEY` estiverem vazias — `src/lib/storage.ts` valida
> isso no carregamento do módulo. Vale para a Vercel também: sem essas variáveis
> configuradas, o deploy quebra na etapa de build, não em runtime.

## O que já vem pronto (herdado do molde)

- **Estoque por lote** com custo real (frete rateado na entrada), inventário,
  ajustes e perdas, e um segundo pool ("Vitrine") separado do estoque vendável.
- **Vendas** com desconto e acréscimo por item e no total, pagamento parcial com
  controle de débito do cliente, cancelamento e devolução parcial.
- **Compras**: pedido ao fornecedor e recebimento com lote e rateio de frete.
- **Despesas** com categorias, recorrência e vencimento.
- **Relatórios**: lucro por período com custo real, ranking e segmentação de
  clientes, curva de produtos.
- **Cotação de frete** (Melhor Envio) — apenas cotação, nunca compra de etiqueta.
- **Assistente de IA** por texto e voz, que registra venda, cliente, fornecedor,
  pedido de compra, entrada de estoque, despesa, ajuste e devolução.
- **Permissões** por papel (Dono, Gerente, Vendedor, Estoque, Consulta) e
  auditoria de tudo que muda.

### Sobre o assistente de IA

Nenhuma ação da IA grava direto: ela monta uma **prévia**, e só um "confirma"
explícito do usuário executa. Essa decisão é tomada no servidor por regra fixa,
nunca pelo modelo — que sequer recebe uma ferramenta de "executar". O lançamento
em lote segue a mesma regra.

## Estrutura

```
src/config/nicho.ts          <- PONTO ÚNICO de personalização
src/lib/                     <- regras de negócio (vendas, estoque, lucro...)
src/lib/garantia.ts          <- garantia do banho
src/lib/taxasCartao.ts       <- taxa da maquininha por forma/parcelas
src/lib/assistente/modelos.ts <- escolhe o modelo de IA sozinho, sem env
src/lib/lote/                <- lançamento em lote: interpretar + aplicar
src/lib/assistente/          <- IA: ferramentas, prévia/confirmação, execução
src/app/                     <- telas e rotas
prisma/schema.prisma         <- modelo de dados
```

## Produção

No ar em **https://tanusjoias.vercel.app** (banco Supabase `yunommseawmtjjhwiwkd`,
região sa-east-1).

> **O `framework` no `vercel.json` não é decoração.** Quando o projeto foi
> importado, a Vercel não detectou o Next.js e ficou com Framework Preset =
> "Other": o build passava (`npm run build` roda igual) mas o resultado era
> publicado como site estático, sem nenhuma rota servida — todo caminho virava
> `404 NOT_FOUND` na borda, com o deploy marcado Ready. Sintoma caro de
> diagnosticar, porque nada no build denuncia. O arquivo evita que se repita
> aqui ou em outro cliente saído do mesmo molde.

## Pendências combinadas

- Trocar `public/logo.svg` (provisório) pela logo definitiva e apontar
  `negocio.logoPath` se o arquivo tiver outro nome.
- Cadastrar as taxas reais da maquininha em Gestão › Taxas do cartão.
- Trocar a senha do usuário dono no primeiro acesso (Usuários).
