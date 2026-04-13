

## Plano: Corrigir cálculo da coluna "Dif %" na página Preço de Mercado

### Problema atual
A coluna "Dif %" sempre calcula `(preço_mercado - preço_tabela) / preço_tabela`, ignorando se o produto tem promoção ativa.

### Lógica correta
- **Se promoção ativa** (`data_fim_promocao` >= hoje E `valor_promocao` preenchido): `Dif = ((nosso_preco_promocao - preco_mercado) / preco_mercado) * 100`
- **Caso contrário**: `Dif = ((nosso_preco_tabela - preco_mercado) / preco_mercado) * 100`

### Alterações em `src/pages/PrecoMercado.tsx`

1. **Criar função auxiliar** `getEffectivePrice(snap)` que retorna `valor_promocao` se a promoção estiver ativa, senão `preco_tabela`.

2. **Corrigir `priceCategories`** (linha ~137): trocar `const efetivo = p.snap.valor_promocao || p.snap.preco_tabela` pela lógica condicional com verificação de `data_fim_promocao` e calcular `diff = ((efetivo - minPrice) / minPrice) * 100`.

3. **Corrigir `getDiff`** (linha ~171-177): usar `getEffectivePrice` ao invés de sempre usar `preco_tabela`, e calcular `((efetivo - mp.preco) / mp.preco) * 100`.

4. **Corrigir `rowDiff`** na renderização da tabela (linha ~492): usar `getEffectivePrice` ao invés de `tabela`, e calcular `((efetivo - mp.preco) / mp.preco) * 100`.

### Impacto
- Os gráficos de pizza e barras também serão corrigidos automaticamente (usam `priceCategories`)
- A ordenação pela coluna Dif % continuará funcionando (usa `getDiff`)

