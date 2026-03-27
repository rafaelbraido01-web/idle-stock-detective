

## Plano: Reestruturar página Preço de Mercado

### Contexto
A página atual mostra produtos com um botão de pesquisa automática online por linha. O usuário quer:
1. **Reestruturar** a página para incluir dados de preço de mercado já salvos no banco (`precos_mercado`)
2. **Botão toggle** no topo para ocultar/exibir a coluna de pesquisa automática

### O que muda

**Arquivo: `src/pages/PrecoMercado.tsx`**

1. **Carregar preços salvos do banco** -- useEffect que busca `precos_mercado` agrupado por `produto_id`, pegando o registro mais recente de cada produto (maior `updated_at`)

2. **Novas colunas na tabela:**
   - **Preço Mercado** -- último valor registrado manualmente ou via pesquisa
   - **Fonte** -- de onde veio (Mercado Livre, Kabum, etc.)
   - **Atualizado em** -- data do último registro
   - **Diferença %** -- comparação entre preço tabela e preço de mercado

3. **Botão toggle no topo** ("Pesquisa Online") usando um Switch ou Button que controla um estado `showAutoSearch`:
   - Quando ativo: mostra a coluna "Ação" com os botões de pesquisa automática (comportamento atual)
   - Quando oculto: esconde essa coluna, deixando a tabela mais limpa para consulta

4. **Ordenação clicável** nos cabeçalhos (mesmo padrão já usado em Promoções/Produtos)

5. **Paginação** para tabelas grandes

### Detalhes técnicos
- Query: `supabase.from('precos_mercado').select('produto_id, preco, updated_at, fonte').order('updated_at', { ascending: false })`
- Agrupar por `produto_id` mantendo apenas o mais recente (mesmo padrão da página Promoções)
- Diferença %: `((precoMercado - precoTabela) / precoTabela) * 100`
- Estado `showAutoSearch` inicia como `false` (oculto por padrão)
- Toggle renderizado como `<Button variant="outline">` com ícone `Eye`/`EyeOff`

