

## Análise de Efetividade de Promoções entre Snapshots

### Objetivo
Criar uma análise que identifique itens em promoção ativa (`data_fim_promocao` válida) e compare a variação de estoque entre dois relatórios importados, revelando quais itens promocionais realmente venderam.

### Dados disponíveis
- `data_fim_promocao`: data de validade da promoção (campo `valid_prom` do ERP)
- `quantidade`: saldo em estoque em cada snapshot
- `valor_promocao`: preço promocional
- `percentual_desconto`: desconto calculado

### Plano de implementação

**1. Nova página "Promoções" (`src/pages/Promocoes.tsx`)**

Conteúdo da página:
- **Seletor de dois snapshots** (anterior e atual) para comparar
- **KPIs resumo**: total de itens em promoção, quantos venderam (quantidade reduziu), quantos não movimentaram, valor total em promoção
- **Tabela comparativa** com colunas:
  - Código, Descrição
  - Validade Promoção (`data_fim_promocao`)
  - Preço Tabela → Preço Promo (% desconto)
  - Qtd Anterior → Qtd Atual → Diferença
  - Status: "Vendeu" (qtd diminuiu), "Sem movimento" (igual), "Aumentou" (reposição)
- Filtros: promoção ativa/expirada, status de venda

**2. Lógica de comparação**
- Filtrar itens do snapshot selecionado que tenham `data_fim_promocao` preenchida
- Cruzar pelo `produto_id` entre os dois snapshots
- Calcular `delta = qtd_anterior - qtd_atual` (positivo = vendeu)

**3. Rota e navegação**
- Adicionar rota `/promocoes` no `App.tsx`
- Adicionar link "Promoções" no `AppSidebar.tsx`

### Escopo técnico
- Toda a lógica roda no frontend usando dados já existentes no `InventoryContext`
- Não requer mudanças no banco de dados ou na importação (os campos já são importados)
- Usa componentes existentes (Card, Table, Badge, Select)

