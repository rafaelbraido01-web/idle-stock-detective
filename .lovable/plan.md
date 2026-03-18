

## Diagnóstico

O scraper atual está falhando na maioria das buscas porque:

1. **Google sempre retorna 429** (rate limit) - bloqueado
2. **Kabum API retorna 404** - endpoint provavelmente incorreto ou bloqueado
3. **DuckDuckGo/Bing** - não extraem links úteis (regex não captura bem)
4. **Busca direta nas lojas** - sites são SPAs (JavaScript), HTML estático não contém links de produtos

Resultado: apenas quando a Kabum API funciona (raro), retorna algo. Caso contrário, 0 resultados.

## Solução: Abordagem Híbrida com Perplexity

O projeto já tem uma **Perplexity API key** configurada e uma função `search-product-price` funcional. A Perplexity tem busca web embutida - ela PODE encontrar produtos e URLs reais.

### Plano

Reescrever o `search-product-scraper` para usar uma **estratégia híbrida**:

```text
1. Perplexity Search (primário)
   → Pede à Perplexity URLs reais de produtos com preços
   → domain_filter: kabum, mercadolivre, amazon, magazineluiza
   
2. Kabum API (complementar, em paralelo)
   → Busca na API JSON da Kabum
   
3. Validação por scraping
   → Para cada URL retornada pela Perplexity, faz fetch real
   → Extrai preço do HTML/JSON-LD (não confia no preço da IA)
   → Aplica score de relevância (sistema já existente)
   
4. Merge + dedup + outlier removal (já existente)
```

### Mudanças no arquivo `supabase/functions/search-product-scraper/index.ts`:

1. **Nova função `searchWithPerplexity()`** - chama Perplexity com prompt focado em retornar URLs de produtos (não apenas preços), usando `search_domain_filter`
2. **Manter Kabum API** em paralelo como complemento
3. **Remover dependência de Google/DuckDuckGo/Bing** - são bloqueados de Edge Functions
4. **Remover `searchStoresDirectly`** - SPAs não retornam HTML útil
5. **Manter toda a lógica de scoring, validação e dedup** que já existe
6. **Validar URLs da Perplexity** via scraping real para confirmar preços

### Fluxo simplificado:

```text
Perplexity retorna URLs + preços estimados
        ↓ (paralelo)
Kabum API retorna produtos + preços
        ↓
Para cada URL da Perplexity → fetch + extractPrices + calculateRelevanceScore
        ↓
Merge resultados validados + Kabum API
        ↓
Dedup por loja → Remove outliers → Ordena por prioridade
        ↓
Retorna top 4 resultados
```

### Vantagens:
- Perplexity TEM busca web real e funciona de Edge Functions (sem bloqueio 429)
- Preços são VALIDADOS via scraping (não confia cegamente na IA)
- Kabum API como complemento quando funciona
- Score de relevância existente continua protegendo contra produtos errados
- Custo: apenas Perplexity (já configurado/pago pelo connector)

### O que NÃO muda:
- `extractPrices()`, `calculateRelevanceScore()`, `extractTitle()`, `isProductAvailable()` - mantidos
- Sistema de scoring >= 60 - mantido
- Dedup, outlier removal, priorização por loja - mantidos
- Interface do frontend - sem alterações

