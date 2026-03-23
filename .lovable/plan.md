

## Plano: Melhorias na Pagina de Promocoes

### 1. Highlight de estoque alto (laranja + foguinho)
Na coluna "Qtd Atual", aplicar texto laranja e emoji 🔥 quando `qtdAtual >= 100`, igual a pagina de Produtos.

### 2. Drawer de detalhamento ao clicar no produto
Reutilizar o componente `ProductDrawer` existente. Tornar cada linha da tabela clicavel, abrindo o drawer com todas as informacoes do produto (quantidade, precos, promocao, historico, graficos).

### 3. Botao "$ Mercado" com preco manual persistido

**Banco de dados** -- criar tabela `precos_mercado`:
```text
id           uuid  PK  default gen_random_uuid()
produto_id   text  NOT NULL
preco        numeric NOT NULL
updated_at   timestamptz NOT NULL default now()
```
- Sem RLS (dados publicos internos, sem autenticacao no app).
- Unique constraint em `produto_id` para manter apenas 1 preco por produto (upsert).

**Na tabela de Promocoes**:
- Adicionar coluna "Mercado" com botao pequeno: emoji 💲 + texto "Mercado".
- Botao fica vermelho se ja tiver preco cadastrado para aquele produto.
- Ao clicar, abre um Dialog/popup com:
  - Campo de input numerico para o preco de mercado.
  - Se ja tiver preco salvo, exibe o valor atual e a data da ultima atualizacao.
  - Botao "Salvar" que faz upsert na tabela `precos_mercado`.

**Alteracoes em arquivos**:

| Arquivo | Mudanca |
|---|---|
| `src/pages/Promocoes.tsx` | Adicionar highlight laranja/foguinho na qtd, linha clicavel com ProductDrawer, coluna "Mercado" com botao e dialog |
| Migration SQL | Criar tabela `precos_mercado` |

### Fluxo do popup de Mercado
1. Usuario clica no botao 💲 Mercado
2. Popup abre mostrando produto, preco atual (se existir) e data
3. Usuario digita o novo preco
4. Clica Salvar → upsert no banco
5. Botao muda para vermelho indicando que tem preco

