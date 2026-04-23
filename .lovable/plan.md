

## Plano: Adicionar filtro de Marca nas telas Promoções, Campanhas e Preço de Mercado

### Contexto
Dashboard e Produtos já possuem filtro por marca. Três telas que trabalham com análise de produtos ainda não têm esse filtro: Promoções, Campanhas e Preço de Mercado.

### O que será feito

**1. Promoções (`src/pages/Promocoes.tsx`)**
- Adicionar state `marcaFilter` e dropdown de seleção de marca
- Filtrar a lista de promoções cruzando o `produto_id` com a tabela de produtos para obter a marca
- Posicionar o filtro junto aos filtros existentes (status, busca)

**2. Campanhas (`src/pages/Campanhas.tsx`)**
- Adicionar state `marcaFilter` e dropdown de seleção de marca
- Filtrar campanhas cujos produtos pertencem à marca selecionada
- Posicionar junto aos filtros existentes (status, busca)

**3. Preço de Mercado (`src/pages/PrecoMercado.tsx`)**
- Adicionar state `marcaFilter` e dropdown de seleção de marca
- Filtrar a tabela de preços de mercado pela marca do produto associado
- Posicionar junto aos filtros existentes

### Detalhes técnicos
- Todas as 3 telas já têm acesso aos dados de `produtos` (via `useInventory` ou consulta direta) — basta cruzar `produto_id` com a lista de produtos para obter a marca
- O padrão de filtro será idêntico ao já usado em Products.tsx: `useMemo` para extrair marcas únicas, `Select` component para o dropdown, lógica de filtragem no `useMemo` principal
- Nenhuma alteração de banco de dados necessária

