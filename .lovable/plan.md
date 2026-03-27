

## Plano: Melhorar Dashboard com Campanhas e Preço de Mercado

### O que muda

**Arquivo: `src/pages/Dashboard.tsx`**

#### 1. Novos dados carregados via Supabase
- Buscar `campanhas_produto` para calcular campanhas ativas/futuras/encerradas
- Buscar `precos_mercado` agrupado por `produto_id` (mais recente de cada)
- Cruzar com os produtos do snapshot atual

#### 2. Novos KPIs (segunda linha, abaixo dos 2 existentes)
- **Campanhas Ativas** -- quantidade de campanhas com status "ativa" hoje
- **Produtos com Preço de Mercado** -- quantos produtos do estoque atual possuem preço de mercado registrado
- **Diferença Média** -- diferença percentual média entre preço tabela e preço de mercado (dos que possuem registro)

#### 3. Novo card: Resumo de Campanhas
- Mini-tabela ou lista mostrando as campanhas ativas com: nome da campanha, canal, quantidade de produtos vinculados, data de fim
- Ordenado por data de fim (mais próxima do vencimento primeiro)
- Exibido ao lado do gráfico de Evolução ou em uma nova linha

#### 4. Novo card: Oportunidades de Preço
- Lista dos produtos com maior diferença negativa (preço de mercado menor que preço tabela) -- produtos onde a concorrência está mais barata
- Colunas: Código, Descrição, Preço Tabela, Preço Mercado, Diferença %
- Top 5-10, ordenado pela maior diferença

### Detalhes técnicos
- Queries diretas ao Supabase com `useEffect` (mesmo padrão usado em PrecoMercado e Campanhas)
- Status de campanha calculado com a mesma lógica de `getCampanhaStatus` da página Campanhas
- Preço de mercado agrupado por `produto_id` mantendo o `updated_at` mais recente
- Diferença %: `((precoMercado - precoTabela) / precoTabela) * 100`
- Os filtros de grupo/marca existentes continuam funcionando para os KPIs de estoque; os novos cards de campanhas e preço ficam independentes dos filtros

### Layout final
```text
[Alertas de Risco]
[Valor Total] [Pareto]
[Campanhas Ativas] [Produtos c/ Preço Mercado] [Diferença Média]
[Últ. Compra] [Custo Médio]
[Curva ABC] [Evolução]
[Campanhas Ativas - detalhe] [Oportunidades de Preço]
[Top 10 Parados]
```

