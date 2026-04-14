

## Plano: Integrar 5 novos campos de preço do ERP

### Novos campos a integrar

| Campo ERP | Coluna no banco |
|-----------|----------------|
| `preco_filial_sp` | `preco_filial_sp` |
| `preco_filial_sc` | `preco_filial_sc` |
| `preco_software_by_maringa` | `preco_software_by_maringa` |
| `preco_corporativo` | `preco_corporativo` |
| `preco_maff` | `preco_maff` |

### Alterações

#### 1. Migração SQL — 5 novas colunas em `estoque_produto_snapshots`
```sql
ALTER TABLE estoque_produto_snapshots
  ADD COLUMN preco_filial_sp numeric DEFAULT 0,
  ADD COLUMN preco_filial_sc numeric DEFAULT 0,
  ADD COLUMN preco_software_by_maringa numeric DEFAULT 0,
  ADD COLUMN preco_corporativo numeric DEFAULT 0,
  ADD COLUMN preco_maff numeric DEFAULT 0;
```

#### 2. Edge Function `sync-erp-webhook`
- Mapear os 5 novos campos para as novas colunas do snapshot.
- Quando `preco_venda = 0`, usar fallback (`preco_atacado` ou outro preço > 0) para `preco_tabela`.

#### 3. Tipos TypeScript (`src/types/inventory.ts`)
- Adicionar os 5 novos campos em `EstoqueProdutoSnapshot`.

#### 4. Frontend — ProductDrawer
- Exibir os novos preços (Filial SP, Filial SC, Software by Maringá, Corporativo, MAFF) na seção "Outros Preços", quando > 0.

#### 5. Frontend — InventoryContext e importExcel
- Incluir os novos campos no mapeamento de dados.

