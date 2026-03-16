

## Plano: Nova Página de Comparação de Snapshots

A imagem mostra duas tabelas que analisam a evolução do estoque ao longo de múltiplas importações (snapshots): uma tabela-resumo horizontal com totais por faixa de aging e diferenças percentuais, e uma tabela vertical com a série histórica de Estoque de Giro, Estoque Parado e Estoque Total.

### O que será feito

**1. Nova página `src/pages/Comparacao.tsx`**

Uma página dedicada que unifica as duas visões da planilha em uma apresentação moderna:

**Seção 1 — Resumo por Snapshot (substitui a tabela horizontal)**
- Uma tabela/cards comparando os snapshots lado a lado
- Para cada snapshot: data, valor total, % de cada faixa de aging (0-90d, 90-180d, 180-270d, 270-365d, 365+), valor do estoque parado (>180d)
- Coluna de **diferença %** entre snapshots consecutivos (verde = diminuiu, vermelho = aumentou)
- Com apenas 1 snapshot, mostra os dados sem diferença; conforme mais imports são feitos, as colunas de comparação aparecem

**Seção 2 — Evolução Histórica (substitui a tabela vertical)**
- Tabela com linhas = snapshots (datas) e 3 colunas principais:
  - **Estoque de Giro** (0-180d): valor + variação %
  - **Estoque Parado** (>180d): valor + variação %
  - **Estoque Total**: valor + variação %
- Células coloridas: verde para variações positivas (giro subindo ou parado descendo), vermelho para o contrário
- Gráfico de linhas abaixo mostrando a evolução dessas 3 métricas ao longo do tempo

**2. Rota e navegação**
- Nova rota `/comparacao` no `App.tsx`
- Novo item "Comparação" no `AppSidebar.tsx`

**3. Lógica de dados**
- Usa `snapshots` e `produtoSnapshots` do `InventoryContext` (já disponível)
- Para cada snapshot, calcula: valor total, valor por faixa de aging, valor de giro vs parado
- Calcula diferenças % entre snapshots consecutivos
- Com 1 snapshot: exibe dados normalmente, sem coluna de diferença
- Com 2+: exibe comparação completa com variações

### Resumo visual

```text
┌─────────────────────────────────────────────────┐
│  COMPARAÇÃO DE SNAPSHOTS                        │
├─────────────────────────────────────────────────┤
│  Resumo por Importação                          │
│  ┌──────────┬──────────┬──────────┬───────────┐ │
│  │          │ Rel. 1   │ Dif %    │ Rel. 2    │ │
│  │ Total    │ 5.941k   │ +30,1%   │ 7.732k    │ │
│  │ 0-90d    │ 4.243k   │ +31,5%   │ 5.579k    │ │
│  │ 90-180d  │  687k    │ +46,9%   │ 1.009k    │ │
│  │ 180-365d │  552k    │ -35,0%   │  359k     │ │
│  │ 365+     │  458k    │ +67,3%   │  766k     │ │
│  │ Parado   │ 1.698k   │ +25,8%   │ 2.135k    │ │
│  └──────────┴──────────┴──────────┴───────────┘ │
│                                                 │
│  Evolução Histórica                             │
│  ┌──────────┬──────────┬──────────┬───────────┐ │
│  │ Data     │ Giro     │ Parado   │ Total     │ │
│  │ 13/06    │ 3.740k   │ 1.555k   │ 5.296k    │ │
│  │ 03/07    │ 3.378k ▼ │ 1.720k ▲ │ 5.099k    │ │
│  │ ...      │ ...      │ ...      │ ...       │ │
│  └──────────┴──────────┴──────────┴───────────┘ │
│                                                 │
│  [Gráfico de linhas: Giro / Parado / Total]     │
└─────────────────────────────────────────────────┘
```

### Arquivos modificados
- **Criar** `src/pages/Comparacao.tsx` — página completa
- **Editar** `src/App.tsx` — adicionar rota `/comparacao`
- **Editar** `src/components/AppSidebar.tsx` — adicionar link na navegação

