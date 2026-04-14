

## Plano: Integrar novos campos de preços do ERP

### Novos campos recebidos do ERP (não armazenados atualmente)

| Campo ERP | Exemplo | Descrição |
|-----------|---------|-----------|
| `preco_padrao` | 0 | Preço padrão |
| `preco_atacado` | 29.42 | Preço atacado |
| `preco_internet` | 31.32 | Preço para internet/e-commerce |
| `preco_marketplace` | 70.24 | Preço marketplace |
| `margem` | null | Margem (ainda não populado pelo ERP) |
| `sku_mktplace` | "" | SKU no marketplace |
| `no_mktplace` | "N" | Flag se está no marketplace |

O campo `preco_venda` já é mapeado como `preco_tabela`. Os 4 novos preços representam **formatos de venda diferentes** do mesmo produto.

### Alterações

#### 1. Migração SQL — adicionar 5 colunas em `estoque_produto_snapshots`
```sql
ALTER TABLE estoque_produto_snapshots
  ADD COLUMN preco_padrao numeric DEFAULT 0,
  ADD COLUMN preco_atacado numeric DEFAULT 0,
  ADD COLUMN preco_internet numeric DEFAULT 0,
  ADD COLUMN preco_marketplace numeric DEFAULT 0,
  ADD COLUMN margem numeric DEFAULT NULL;
```

#### 2. Migração SQL — adicionar 2 colunas em `produtos`
```sql
ALTER TABLE produtos
  ADD COLUMN sku_mktplace text DEFAULT '',
  ADD COLUMN no_mktplace text DEFAULT 'N';
```

#### 3. Edge Function `sync-erp-webhook`
- Mapear `row.preco_padrao`, `row.preco_atacado`, `row.preco_internet`, `row.preco_marketplace`, `row.margem` para as novas colunas do snapshot.
- Mapear `row.sku_mktplace`, `row.no_mktplace` no upsert de produtos.

#### 4. Frontend — ProductDrawer
- Exibir os 4 preços (Padrão, Atacado, Internet, Marketplace) no detalhe do produto, quando > 0.

#### 5. Frontend — Página Promoções
- Adicionar coluna "Preço Atacado" na tabela (ordenável), pois é relevante para comparação com promoção.

#### 6. Tipos TypeScript
- Atualizar `EstoqueProdutoSnapshot` e `Produto` em `src/types/inventory.ts` com os novos campos.

### O que NÃO muda
- `preco_tabela` continua sendo o `preco_venda` do ERP (já funciona assim).
- O campo `margem` será armazenado mas exibido como "—" até o ERP popular.

