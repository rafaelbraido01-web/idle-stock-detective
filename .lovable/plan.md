## Plano: Página /alertas com cards Glass + configurações

### 1. Novo hook `src/hooks/useAlertasConfig.ts`
Persistência em `localStorage` (chave `alertas-config`) com defaults:
```ts
{
  estoqueParado: { enabled: true, diasMin: 90, valorMin: 10000 },
  precoMercado: { enabled: true, diasVerde: 15, diasVermelho: 25 },
  marcasPadrao: [] as string[],
}
```
Exporta `config` e `updateConfig(partial)`.

### 2. Nova página `src/pages/Alertas.tsx`
**Dados:**
- `useInventory()` para snapshot atual + produtos
- Query única em `precos_mercado` agrupada por `produto_id` (mais recente)

**Geração dos alertas (por produto do snapshot atual):**
- Regra A — **Estoque parado**: `dias_sem_compra >= diasMin` E `valor_total >= valorMin`
- Regra B — **Preço de mercado**: sem registro OU `daysSince(updated_at) > diasVermelho`
- Produto entra na lista se disparar pelo menos 1 regra ativa

**Header:**
- Título + contador "X alertas exibidos"
- KPIs rápidos (3 cards menores): total de alertas, valor total em risco, sem preço de mercado
- Botão "Copiar códigos" (mesma lógica de Promoções)

**Filtros (linha logo abaixo):**
- Multi-select **Marca** (Popover + checkbox + busca, padrão Products.tsx), pré-populado com `marcasPadrao`
- Chips toggle por tipo: "Estoque parado" / "Preço desatualizado"
- Ordenação: Maior valor / Mais antigo / Marca (A-Z)
- Busca por código/descrição

**Cards Glass (grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`):**
- Classe base: `relative overflow-hidden rounded-2xl border border-white/20 bg-white/60 dark:bg-white/5 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all`
- Borda lateral esquerda colorida (4px) por severidade:
  - 🔴 Vermelho: sem preço ou >diasVermelho
  - 🟡 Âmbar: entre diasVerde e diasVermelho
  - 🟢 Verde: ≤ diasVerde
- Conteúdo:
  - Linha 1: código (mono) + marca em badge sutil
  - Linha 2: descrição (line-clamp-2, font-semibold)
  - Linha 3: grid 2 colunas com **Valor estoque** (R$, destaque) e **Quantidade**
  - Linha 4: **Última compra** "DD/MM/YYYY · há Nd"
  - Linha 5: **Badge preço mercado**:
    - Verde "Atualizado há Nd" / Âmbar "Há Nd" / Vermelho "Desatualizado há Nd" / Cinza "Sem preço"
  - Chips de regras disparadas (ex: "Parado +90d", "Sem preço")
  - Botão "Ver detalhes" → abre `ProductDrawer` existente

### 3. Atualização `src/pages/Configuracoes.tsx`
Nova seção **"Alertas"** (acima da seção de provedor):
- Switch + 2 inputs numéricos para **Estoque parado** (diasMin / valorMin)
- Switch + 2 inputs numéricos para **Preço de mercado** (diasVerde / diasVermelho) com validação `verde < vermelho`
- Multi-select Popover de **Marcas padrão** (mesmo padrão Products.tsx)
- Bloco "Compradora por marca" com badge "Em breve" (sem campo funcional)
- Salva via `updateConfig` com toast de confirmação

### 4. Integração de sistema
- **`src/App.tsx`**: importar `Alertas`, registrar `<Route path="/alertas" element={<GuardedRoute page="alertas"><Alertas /></GuardedRoute>} />`
- **`src/components/AppSidebar.tsx`**: adicionar item `{ title: 'Alertas', url: '/alertas', icon: AlertTriangle, toggleKey: 'alertas' }` (posição: logo após Dashboard)
- **`src/store/PageVisibilityContext.tsx`**: adicionar `'alertas'` ao tipo `ToggleablePage` e mapeamento de rotas
- **`src/pages/Configuracoes.tsx`**: adicionar `{ key: 'alertas', label: 'Alertas' }` em `toggleablePages`

### 5. Sem alterações de banco
- Toda config em `localStorage`
- RBAC continua via `user_allowed_pages` — usuários existentes precisarão receber `'alertas'` manualmente se quiserem acesso (admin com acesso total já vê)

### 6. Detalhes técnicos
- Reaproveitar `parseLocalDate`, `formatCurrency`, `ProductDrawer`, `cn`
- `useMemo` em todas as transformações pesadas
- Renderização limitada (alertas serão subset pequeno; sem paginação inicial — adicionar se passar de 200)
- Acessibilidade: `aria-label` nos botões, contraste mantido nas cores Glass

### Melhorias incluídas (sem impacto operacional)
- KPIs compactos no topo da página de Alertas
- Botão "Copiar códigos" reaproveitando padrão existente
- Busca textual no filtro de marcas (já padrão Products)
- Chip mostrando regra exata disparada em cada card