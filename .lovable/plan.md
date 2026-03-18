

## Plano: Ajustar colunas da tabela de Preço de Mercado

### Alterações em `src/pages/PrecoMercado.tsx`:

1. **Remover coluna "Marca"** — remover o `TableHead` (linha 174) e o `TableCell` (linha 193) correspondentes.

2. **Adicionar coluna "Preço Promoção"** — inserir uma nova coluna entre "Preço Tabela" e "Ação", exibindo `p.snap.valor_promocao` formatado com `formatCurrency`. Quando não houver valor de promoção, exibir "—".

### Resultado final das colunas:
Código | Descrição | Qtd | Preço Tabela | **Preço Promoção** | Ação

