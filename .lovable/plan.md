

## Plano: Integrar Firecrawl no Pipeline de Scraping

### Pré-requisito
Conectar o **Firecrawl connector** ao projeto para disponibilizar `FIRECRAWL_API_KEY` nas Edge Functions.

### Alterações: `supabase/functions/search-product-scraper/index.ts`

#### 1. Nova função `scrapeWithFirecrawl(url)` (substitui `scrapePage`)

```typescript
async function scrapeWithFirecrawl(url: string): Promise<{ html: string; markdown: string } | null>
```

- Chama `https://api.firecrawl.dev/v1/scrape` com `formats: ["html", "markdown"]`
- Timeout: 8 segundos
- Retorna `{ html, markdown }` ou `null` em caso de falha

#### 2. Nova função `scrapePageWithFirecrawl(url, productCode, productName, perplexityPrice)`

Substitui a `scrapePage` atual:
- Tenta Firecrawl primeiro → extrai título/preço do HTML renderizado
- Se Firecrawl falhar → fallback para fetch simples (código atual)
- Aplica `extractPrices()`, `calculateRelevanceScore()`, `isProductAvailable()` — sem alterações
- Usa `content = html || markdown` para extração

#### 3. Controle de concorrência no handler principal

- **Máximo 2 URLs por produto** (limita `perplexityData.urls.slice(0, 2)`)
- **Máximo 3 scrapes simultâneos** via semáforo simples:

```typescript
async function withConcurrencyLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]>
```

#### 4. Mudanças no handler principal (linhas 680-684)

Substituir:
```typescript
const scrapePromises = perplexityData.urls.map(url =>
  scrapePage(url, ...)
);
const scraped = await Promise.all(scrapePromises);
```

Por:
```typescript
const urlsToScrape = perplexityData.urls.slice(0, 2);
const tasks = urlsToScrape.map(url => () => scrapePageWithFirecrawl(url, ...));
const scraped = await withConcurrencyLimit(tasks, 3);
```

### O que NÃO muda
- `extractPrices()`, `calculateRelevanceScore()`, `extractTitle()`, `isProductAvailable()`
- `searchWithPerplexity()`, `searchKabumAPI()`
- `formatWithAI()`, `removeOutliers()`, `deduplicateBySource()`
- Todo o sistema de scoring, dedup, priorização

### Passos de implementação
1. Conectar Firecrawl connector ao projeto
2. Reescrever `scrapePage` → `scrapePageWithFirecrawl` com Firecrawl + fallback fetch
3. Adicionar semáforo de concorrência
4. Limitar URLs a 2 por produto
5. Adicionar logs detalhados (tempo de execução, sucesso/falha, fallback usado)

