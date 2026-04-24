## Plano final — pronto para implementar

### 1. `src/pages/Alertas.tsx`
- **Remover** o chip/botão "Preço desatualizado" da barra de filtros e o estado `tipoFilter.preco` correspondente; manter apenas o chip "Estoque parado" (vira um toggle único). Simplificar a lógica de `filtered` removendo o filtro por tipo de preço.
- **Adicionar** estado `updateDialog: { codigo, descricao, marca, precoTabela } | null` para controlar o diálogo de atualização.
- **Adicionar** função `updatePrecoLocal(codigo, preco, updatedAt)` que atualiza `precosMap` no `setState` — o `useMemo` de `alertas` recalcula severidade e badges automaticamente (vermelho → verde na hora).
- **No `AlertaCard`**: adicionar prop `onUpdatePrice` e um segundo botão **"Atualizar preço"** (ícone `RefreshCw`) ao lado de "Ver detalhes", em grid de 2 colunas (`grid-cols-2 gap-2`).
- **Renderizar** `<MarketPriceUpdateDialog>` no final do componente, controlado pelo estado novo, passando `onSaved={updatePrecoLocal}`.

### 2. `src/components/MarketPriceUpdateDialog.tsx` (novo)
Diálogo unificado com **2 abas** (Tabs do shadcn):

**Aba "Buscar online"**
- Botão "Pesquisar agora" → chama `supabase.functions.invoke()` lendo o provider de `localStorage.getItem('preco-mercado-provider')` (default `scraper`):
  - `scraper` → `search-product-scraper` com `{ productName, productCode }`
  - `chatgpt`/`perplexity` → `search-product-price` com `{ productName, productCode, provider }`
- Lista resultados (source, productName, price, link "Validar") com botão **"Usar este preço"** que faz `INSERT` em `precos_mercado` (mapeando `source` para uma fonte conhecida, ou `Outro` + `fonte_outro`) e fecha o diálogo.

**Aba "Cadastro manual"**
- Campos: `preco`, `fonte` (select com `Mercado Livre`, `Kabum`, `Pichau`, `Amazon`, `Magazine Luiza`, `Netshoes`, `Outro`), `fonte_outro` (quando `Outro`), `link` (opcional), `observacao` (opcional).
- Botão "Salvar preço" → mesmo `INSERT`.

**Comportamento comum**
- Após `INSERT` bem-sucedido: chama `onSaved(codigo, preco, now)`, exibe toast e fecha.
- `onPointerDownOutside` e `onEscapeKeyDown` bloqueados (regra de UX vigente para diálogos de preço).
- Reset de estado ao abrir.

### 3. Sem mudanças em outros arquivos
- `PrecoMercado.tsx` permanece como está (a refatoração para extrair helper compartilhado era opcional e foi descartada para evitar risco de regressão na página crítica). O `MarketPriceUpdateDialog` consome diretamente as Edge Functions, replicando o mesmo padrão já validado em `PrecoMercado.tsx` e `Promocoes.tsx`.
- Sem migrações de banco. Sem novos secrets.

### Resultado esperado
Em qualquer card vermelho/âmbar de `/alertas`, o usuário clica **"Atualizar preço"** → escolhe Buscar online ou Cadastro manual → salva → o card recalcula a severidade na hora (badge "Atualizado há 0d", borda verde) sem precisar recarregar a página.