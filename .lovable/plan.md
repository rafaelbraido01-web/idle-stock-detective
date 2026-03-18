

## Plano: Sistema de Fallback Inteligente e Score de Relevância

### Arquivo: `supabase/functions/search-product-scraper/index.ts` (reescrita parcial)

### 1. Sistema de Fallback em 3 Níveis

O handler principal será reestruturado com um loop de tentativas:

```text
Nível 1: Código exato (ex: "SWG256G site:kabum.com.br")
    ↓ se 0 resultados
Nível 2: Marca + capacidade + tipo (ex: "WINMEMORY 256GB NVME site:kabum.com.br")
    ↓ se 0 resultados  
Nível 3: Categoria genérica (ex: "SSD 256GB NVME 2280 preço")
```

Nova função `buildFallbackQueries(productName, productCode, level)` gera as queries para cada nível, extraindo automaticamente marca, capacidade e tipo do nome do produto.

### 2. Score de Relevância (substitui `isRelevantProduct`)

Nova função `calculateRelevanceScore(title, code, productName) → number`:

| Critério | Pontos |
|----------|--------|
| Contém código exato do fabricante | +50 |
| Contém marca (ex: WINMEMORY, KINGSTON) | +30 |
| Contém capacidade correta (ex: 256GB) | +20 |
| Contém tipo correto (ex: NVME, DDR4, IPS) | +10 |

- Resultado aceito apenas se **score >= 60**
- O score é retornado junto com cada resultado para ordenação

### 3. Páginas de busca como intermediárias

- Remover `/busca` e `/search` do `BLOCKED_PATH_PATTERNS`
- Criar nova função `isSearchPage(url)` que identifica URLs de busca
- `searchStoresDirectly` pode usar essas páginas para **extrair links de produtos**, mas elas nunca aparecem como resultado final
- Validação no `scrapePage`: se a URL final for de busca → rejeitar

### 4. Filtros de descarte aprimorados

- **Sem preço**: já existe, mantido
- **Indisponível**: detectar "indisponível", "out of stock", "esgotado" no HTML e em JSON-LD (`availability`)
- **Baixa relevância**: score < 60
- **Preço fora da faixa**: manter filtro de outliers (0.3x a 3x da mediana)

### 5. Priorização de fontes (Kabum via API)

- Adicionar busca na **API JSON da Kabum**: `https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?query={term}`
- Esta API retorna JSON com nome, preço e URL do produto — elimina problemas de SPA
- Executada em paralelo com as buscas nos motores
- Prioridade de ordenação mantida: Kabum > ML > Amazon > Magalu > Pichau

### 6. Timeouts aumentados

- Motores de busca: 5s → 8s
- Scrape de páginas: 5s → 8s
- Kabum API: 6s

### Resumo das mudanças

Todas no arquivo `supabase/functions/search-product-scraper/index.ts`:
- Nova `calculateRelevanceScore()` substituindo `isRelevantProduct()`
- Nova `buildFallbackQueries()` com 3 níveis
- Nova `searchKabumAPI()` para busca direta via API JSON
- Nova `isProductAvailable()` para detectar indisponibilidade
- Reestruturação do handler principal com loop de fallback
- Ajuste de `BLOCKED_PATH_PATTERNS` e validação de URLs de busca
- Timeouts aumentados para 8s

