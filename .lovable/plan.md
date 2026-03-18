

## Plano: Página "Preço de Mercado" com Pesquisa de Preços via IA

### Visão Geral

Criar uma nova página que lista os produtos em estoque com um botão para pesquisar preços online. Ao clicar, uma IA (Lovable AI) pesquisa o produto no Mercado Livre e Kabum, retornando os 2 melhores preços com links clicáveis. Os resultados aparecem em um popup (Dialog).

### Arquitetura

1. **Edge Function** (`search-product-price`): Recebe o nome/descrição do produto e usa um modelo de IA (Perplexity ou Lovable AI com `sonar`) para pesquisar preços reais no Mercado Livre e Kabum. Retorna JSON estruturado com nome, preço, link e fonte.

2. **Nova página** (`src/pages/PrecoMercado.tsx`): Lista produtos do último snapshot com botão "Pesquisar preço online". Ao clicar, chama a edge function e exibe resultados em um Dialog.

3. **Rota e navegação**: Adicionar rota `/preco-mercado` no App.tsx e item no sidebar.

### Implementação Detalhada

#### 1. Edge Function `supabase/functions/search-product-price/index.ts`
- Recebe `{ productName: string, productCode: string }` via POST
- Usa Lovable AI (modelo `sonar-pro` via Perplexity — já disponível como modelo suportado? Não, Perplexity é um connector separado). 
- **Abordagem**: Usar Lovable AI com `google/gemini-2.5-flash` para gerar uma pesquisa estruturada. O prompt pedirá ao modelo para retornar preços reais do Mercado Livre e Kabum para o produto exato, com URLs reais.
- Alternativa mais precisa: usar o **connector Perplexity** (modelo `sonar`) que faz pesquisa web real com citações/links reais.
- **Decisão**: Perplexity é a melhor opção pois retorna dados de pesquisa web real com links verificáveis. Modelos de linguagem como Gemini podem inventar URLs.

#### 2. Fluxo com Perplexity
- Conectar o connector Perplexity ao projeto
- Edge function usa `PERPLEXITY_API_KEY` para chamar a API com prompt estruturado
- Prompt: pesquisar o produto exato no Mercado Livre e Kabum, retornar JSON com `{ results: [{ source, productName, price, url }] }`
- Usar `search_domain_filter: ['mercadolivre.com.br', 'kabum.com.br']` para filtrar fontes
- Usar `response_format: json_schema` para output estruturado

#### 3. Página `PrecoMercado.tsx`
- Lista produtos do último snapshot (código, descrição, marca, preço tabela, quantidade)
- Botão "Pesquisar preço online" em cada linha
- Estado de loading por produto (spinner no botão)
- Dialog/popup ao receber resultado:
  - Mostra até 2 resultados (Mercado Livre + Kabum)
  - Cada resultado: nome do produto encontrado, preço, link clicável (abre em nova aba), fonte
  - Botão "Confirmar" para fechar
- Resultados ficam salvos em estado local para não re-pesquisar

#### 4. Navegação
- Adicionar item "Preço de Mercado" no sidebar com ícone `DollarSign`
- Adicionar rota no `App.tsx`

### Arquivos a Criar/Editar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/search-product-price/index.ts` | Criar |
| `src/pages/PrecoMercado.tsx` | Criar |
| `src/App.tsx` | Editar (adicionar rota) |
| `src/components/AppSidebar.tsx` | Editar (adicionar nav item) |
| `supabase/config.toml` | Editar (adicionar config da function) |

### Pré-requisito

Será necessário conectar o **Perplexity** como connector para viabilizar a pesquisa web real com links verificáveis. Modelos de linguagem padrão (Gemini, GPT) não conseguem retornar URLs reais de produtos — eles inventam links.

