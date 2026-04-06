

# Plano: Melhorar Filtros da Página de Promoções

## Situação Atual
A página `/promocoes` possui apenas 2 filtros: **Status** (vendeu/sem-movimento/reposição) e **Promoção** (ativa/expirada). Não há busca por texto nem filtros por grupo, subgrupo, marca, etc.

A página `/produtos` serve como referência, com: busca por código/descrição, grupo, subgrupo, marca, categoria de estoque, última compra e comissão.

## O que será feito

### 1. Adicionar campo de busca por código/descrição
- Input com ícone de lupa, igual ao da página de Produtos
- Filtra por código ou descrição do produto

### 2. Adicionar filtros de Grupo, Subgrupo e Marca
- Selects dinâmicos baseados nos produtos disponíveis nos comparisons
- Mesma estrutura visual dos filtros em `/produtos`

### 3. Reorganizar layout dos filtros
- Linha de filtros com `flex-wrap gap-3`, busca à esquerda
- Selects de Status e Promoção permanecem
- Novos selects de Grupo, Subgrupo, Marca adicionados
- Botão "Subir Campanha" continua no `ml-auto`

### 4. Atualizar lógica de filtragem
- Adicionar estados: `search`, `grupoFilter`, `subgrupoFilter`, `marcaFilter`
- Aplicar filtros no `useMemo` de `filtered`, antes da ordenação
- Reset de página ao mudar qualquer filtro

### Detalhes técnicos
- **Arquivo editado**: `src/pages/Promocoes.tsx`
- Extrair listas de grupos/subgrupos/marcas dos `comparisons` (via lookup no array `produtos`)
- Padrão idêntico ao usado em `Products.tsx`

